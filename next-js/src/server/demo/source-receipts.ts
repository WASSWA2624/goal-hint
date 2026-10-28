import "server-only";

import { z } from "zod";
import { getPublicationDeadline, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketRules, validateMarketSnapshot } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseFallbackMarketSnapshot } from "../fallback/fallback-input.ts";
import { parseForecastSourceReceipts, type ForecastSourceReceipts } from "../fallback/source-receipts.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../football/api-football-contract.ts";
import { normalizeFallbackPrediction } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { StoredRevision } from "../predictions/history-contract.ts";
import { historyHash, historyId, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson, revisionFromRows, type HistoryRow } from "../predictions/history-read.ts";
import { assertDemoDatabase } from "./member.ts";
import { demoHash, demoId, demoModel } from "./forecast.ts";
import { DEMO_START_DATE, DEMO_END_DATE, demoApiFootballResponse, demoFixtureById } from "./api-football.ts";

export const DEMO_SOURCE_PAIR_NOTICE = "Synthetic comparison replay generated from the original demo forecast and simulated API-Football response; this is not an original source capture.";
export const demoSourcePairRules = Object.freeze({ batchSize: 100, maximumReadBytes: 8_388_608 });
type Tx = Prisma.TransactionClient;
const schema = z.strictObject({ version: z.literal(1), kind: z.literal("synthetic-comparison-replay"), notice: z.literal(DEMO_SOURCE_PAIR_NOTICE),
  revisionId: historyId, fixtureId: historyId, cycleId: historyId, jobId: historyHash, candidateHash: historyHash,
  requestHash: historyHash, evidenceHash: historyHash, modelVersionId: z.literal(demoModel.id),
  analysisAt: historyInstant, evidenceCutoffAt: historyInstant, forecastAt: historyInstant, publishedAt: historyInstant,
  kickoffAt: historyInstant, originalAuditJson: z.string().min(2).max(100_000),
  replayAt: historyInstant, replayOrder: z.literal("ai-first"),
  provider: z.strictObject({ endpoint: z.literal("predictions"), externalFixtureId: z.number().int().positive(),
    contractVersion: z.literal(API_FOOTBALL_CONTRACT_VERSION), observedAt: historyInstant, observationHash: historyHash }),
  // Preserve exact IEEE-754 receipt distributions across MySQL JSON rendering.
  // The enclosing JSON still receives the normal SQL seal; receipt parsing is unchanged.
  sourcesJson: z.string().min(2).max(1_000_000),
}).refine(value => value.analysisAt <= value.evidenceCutoffAt && value.evidenceCutoffAt <= value.forecastAt &&
  value.forecastAt <= value.publishedAt && value.publishedAt < getPublicationDeadline(utcInstantFromEpochMilliseconds(value.kickoffAt)) &&
  value.provider.observedAt >= value.analysisAt && value.provider.observedAt <= value.forecastAt && value.replayAt >= value.publishedAt);
export type DemoSourcePair = Readonly<z.infer<typeof schema>>;

function nativeRevision(revision: StoredRevision): void {
  const context = revision.candidate.context;
  if (revision.modelVersionId !== demoModel.id || context.pin?.modelVersionId !== demoModel.id || context.jobId !== revision.jobId ||
    context.context.fixtureId !== revision.fixtureId || context.context.cycleId !== revision.cycleId ||
    revision.fixtureId !== demoId("fixture", context.context.externalFixtureId) ||
    revision.cycleId !== demoId("cycle", context.context.externalFixtureId) ||
    revision.id !== demoId("revision", context.context.externalFixtureId) || revision.jobId !== demoHash(`job:${context.context.externalFixtureId}`)) {
    throw new Error("Synthetic comparison replay requires its original canonical demo revision.");
  }
}

function originalAiReceipt(revision: StoredRevision): ForecastSourceReceipts["ai"] {
  const original = revision.candidate, firstAi = Object.values(original.markets).find(item => item.available && item.provenance.kind === "ai");
  if (!firstAi?.available || firstAi.provenance.kind !== "ai" || Object.values(original.markets).some(item => item.available && item.market.source !== "ai")) {
    throw new Error("Synthetic comparison replay requires the stored AI source distribution.");
  }
  const markets = parseFallbackMarketSnapshot({ ruleVersion: marketRules.ruleVersion, policy: marketRules, issues: original.issues,
    markets: Object.fromEntries(Object.entries(original.markets).map(([family, item]) => [family,
      item.available ? { available: true, market: item.market } : item])) }, "ai");
  return { source: "ai", status: "candidate", reason: null, markets, timestamps: firstAi.timestamps,
    version: demoModel.contractVersion, modelVersionId: demoModel.id, evidence: {
      conflicting: firstAi.provenance.evidence.missingness.some(item => item.reason === "conflicting"),
      limitedNews: firstAi.provenance.evidence.coverage.limitedNews } };
}

/** Explicit diagnostic replay, never a historical fallback-stage assertion or a revised forecast. */
export function prepareDemoSourcePair(revision: StoredRevision, replayAt: number): DemoSourcePair {
  nativeRevision(revision);
  const context = revision.candidate.context.context, observedAt = context.analysisAt + 1000;
  const fixture = demoFixtureById(context.externalFixtureId, observedAt);
  if (!fixture || fixture.fixture.timestamp * 1000 !== context.kickoffAt ||
    context.home.teamId !== demoId("team", fixture.teams.home.id) || context.away.teamId !== demoId("team", fixture.teams.away.id)) {
    throw new Error("Synthetic comparison replay fixture identity is invalid.");
  }
  const raw = demoApiFootballResponse("predictions", { fixture: String(context.externalFixtureId) }, observedAt).response;
  if (!Array.isArray(raw) || raw.length !== 1) throw new Error("Synthetic comparison replay prediction is unavailable.");
  const normalized = normalizeFallbackPrediction(raw[0], { endpoint: "/predictions", retrievedAt: utcInstantFromEpochMilliseconds(observedAt) });
  if (!normalized.valid || normalized.data.homeTeam.id !== context.home.externalId || normalized.data.awayTeam.id !== context.away.externalId) {
    throw new Error("Synthetic comparison replay provider normalization failed.");
  }
  const original = revision.candidate;
  const percentages = normalized.data.reportedPercentages;
  const providerBase = validateMarketSnapshot({ "match-result": { source: "api-football", period: marketRules.period,
    probabilities: { "home-win": percentages.home === null ? null : percentages.home / 100,
      draw: percentages.draw === null ? null : percentages.draw / 100, "away-win": percentages.away === null ? null : percentages.away / 100 } } });
  const unsupported = ["total-goals", "both-teams-to-score"] as const;
  const providerMarkets = { ...providerBase, markets: { ...providerBase.markets,
    "total-goals": { available: false as const, reason: "unsupported-family" as const },
    "both-teams-to-score": { available: false as const, reason: "unsupported-family" as const } },
  issues: [...providerBase.issues.filter(issue => !unsupported.some(family => family === issue.family)),
    ...unsupported.map(family => ({ family, reason: "unsupported-family" as const }))] };
  const sources = parseForecastSourceReceipts({ version: 1, order: "ai-first",
    ai: originalAiReceipt(revision),
    "api-football": { source: "api-football", status: "candidate", reason: null, markets: providerMarkets,
      timestamps: { generatedAt: null, retrievedAt: observedAt, providerUpdatedAt: normalized.data.source.providerUpdatedAt },
      version: API_FOOTBALL_CONTRACT_VERSION, modelVersionId: null, evidence: null } });
  return freezeEvidence(schema.parse({ version: 1, kind: "synthetic-comparison-replay", notice: DEMO_SOURCE_PAIR_NOTICE,
    revisionId: revision.id, fixtureId: revision.fixtureId, cycleId: revision.cycleId, jobId: revision.jobId,
    candidateHash: evidenceFingerprint(original), requestHash: revision.requestHash, evidenceHash: revision.evidenceHash, modelVersionId: demoModel.id,
    analysisAt: context.analysisAt, evidenceCutoffAt: revision.evidenceCutoffAt, forecastAt: revision.generationCompletedAt,
    publishedAt: revision.publishedAt, kickoffAt: context.kickoffAt, originalAuditJson: evidenceSerialize(original.audit),
    replayAt, replayOrder: "ai-first", provider: { endpoint: "predictions", externalFixtureId: context.externalFixtureId,
      contractVersion: API_FOOTBALL_CONTRACT_VERSION, observedAt, observationHash: evidenceFingerprint(normalized.data) }, sourcesJson: evidenceSerialize(sources) }));
}

function validatedSourcePair(row: HistoryRow, revision: StoredRevision) {
  nativeRevision(revision); assertHistorySeal(row.validIntegrity);
  const pair = schema.parse(historyJson(row.body)), context = revision.candidate.context.context;
  if (row.revisionId !== pair.revisionId || row.fixtureId !== pair.fixtureId || row.cycleId !== pair.cycleId || row.jobId !== pair.jobId ||
    row.candidateHash !== pair.candidateHash || !(row.forecastAt instanceof Date) || row.forecastAt.getTime() !== pair.forecastAt ||
    !(row.replayAt instanceof Date) || row.replayAt.getTime() !== pair.replayAt ||
    pair.revisionId !== revision.id || pair.fixtureId !== revision.fixtureId || pair.cycleId !== revision.cycleId || pair.jobId !== revision.jobId ||
    pair.candidateHash !== evidenceFingerprint(revision.candidate) || pair.requestHash !== revision.requestHash || pair.evidenceHash !== revision.evidenceHash ||
    pair.analysisAt !== context.analysisAt || pair.evidenceCutoffAt !== revision.evidenceCutoffAt || pair.forecastAt !== revision.generationCompletedAt ||
    pair.publishedAt !== revision.publishedAt || pair.kickoffAt !== context.kickoffAt || pair.provider.externalFixtureId !== context.externalFixtureId ||
    pair.originalAuditJson !== evidenceSerialize(revision.candidate.audit)) throw new Error("Synthetic comparison replay binding is invalid.");
  const sources = parseForecastSourceReceipts(JSON.parse(pair.sourcesJson));
  if (sources.order !== pair.replayOrder || evidenceFingerprint(sources.ai) !== evidenceFingerprint(originalAiReceipt(revision)) ||
    pair.provider.observedAt !== context.analysisAt + 1000 || sources["api-football"].version !== API_FOOTBALL_CONTRACT_VERSION ||
    sources["api-football"].timestamps?.generatedAt !== null ||
    sources["api-football"].timestamps?.retrievedAt !== pair.provider.observedAt) throw new Error("Synthetic comparison replay source clocks are invalid.");
  for (const family of ["total-goals", "both-teams-to-score"] as const) {
    const market = sources["api-football"].markets.markets[family];
    if (market.available || market.reason !== "unsupported-family") throw new Error("Synthetic comparison replay invented a provider counterpart.");
  }
  return freezeEvidence({ pair, sources });
}

export function demoSourcePairFromRow(row: HistoryRow, revision: StoredRevision): DemoSourcePair { return validatedSourcePair(row, revision).pair; }

const ready = new WeakMap<DatabaseRuntime, Promise<void>>();
async function initialize(database: DatabaseRuntime) {
  assertDemoDatabase();
  let operation = ready.get(database);
  if (!operation) {
    operation = database.query(async tx => {
      const [row] = await tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
      if (!row || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(row.name)) throw new Error("Synthetic source pairs require the isolated demo database.");
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS DevelopmentDemoSourcePair (
        revisionId CHAR(36) NOT NULL,fixtureId CHAR(36) NOT NULL,cycleId CHAR(36) NOT NULL,jobId CHAR(64) NOT NULL,
        candidateHash CHAR(64) NOT NULL,forecastAt DATETIME(3) NOT NULL,replayAt DATETIME(3) NOT NULL,integrity CHAR(64) NOT NULL,body JSON NOT NULL,
        PRIMARY KEY(revisionId),CONSTRAINT DevelopmentDemoSourcePair_revision_fk FOREIGN KEY(revisionId) REFERENCES PredictionSet(id),
        CONSTRAINT DevelopmentDemoSourcePair_seal CHECK(integrity=SHA2(CAST(body AS CHAR),256)))
        ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    }).catch(error => { ready.delete(database); throw error; });
    ready.set(database, operation);
  }
  await operation;
}

/** Bootstrap-only append. Existing forecast, audit, stage, result and saved-slip rows stay immutable. */
export async function ensureDemoSourcePairs(database: DatabaseRuntime, dates: readonly string[], replayAt = Date.now()): Promise<void> {
  await initialize(database);
  for (const date of [...new Set(dates)]) {
    parseReportingDate(date);
    if (date < DEMO_START_DATE || date > DEMO_END_DATE) continue;
    let after = "";
    for (;;) {
      const rows = await database.query(tx => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
        r.integrity=SHA2(CONCAT(r.id,':',r.requestHash,':',CAST(r.candidateJson AS CHAR)),256) AS validIntegrity
        FROM PredictionSet r JOIN FootballFixture f ON f.id=r.fixtureId WHERE f.eatDate=${new Date(`${date}T00:00:00Z`)}
        AND r.modelVersionId=${demoModel.id} AND r.publishedAt<=${new Date(replayAt)} AND r.id>${after}
        AND NOT EXISTS(SELECT 1 FROM DevelopmentDemoSourcePair p WHERE p.revisionId=r.id)
        ORDER BY r.id LIMIT ${demoSourcePairRules.batchSize}`));
      if (!rows.length) break;
      after = String(rows.at(-1)!.id);
      const ids = rows.map(row => String(row.id));
      const markets = await database.query(tx => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(payloadJson AS CHAR),256) AS validIntegrity
        FROM MarketPrediction WHERE setId IN (${Prisma.join(ids)})`));
      const revisions = rows.map(row => revisionFromRows(row, markets.filter(market => market.setId === row.id)));
      const pairs = revisions.map(revision => prepareDemoSourcePair(revision, replayAt));
      await database.transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ApiQuotaAccount WHERE id=${demoHash("odds-account")} FOR UPDATE`;
        const existing = new Map((await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
          FROM DevelopmentDemoSourcePair WHERE revisionId IN (${Prisma.join(ids)})`)).map(row => [String(row.revisionId), row]));
        const fresh = pairs.filter((pair, index) => {
          const row = existing.get(pair.revisionId);
          if (row) demoSourcePairFromRow(row, revisions[index]!);
          return !row;
        });
        if (!fresh.length) return;
        await tx.$executeRaw(Prisma.sql`INSERT INTO DevelopmentDemoSourcePair
          (revisionId,fixtureId,cycleId,jobId,candidateHash,forecastAt,replayAt,integrity,body)
          VALUES ${Prisma.join(fresh.map(pair => { const body = evidenceSerialize(pair); return Prisma.sql`
            (${pair.revisionId},${pair.fixtureId},${pair.cycleId},${pair.jobId},${pair.candidateHash},${new Date(pair.forecastAt)},${new Date(pair.replayAt)},
            SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256),JSON_EXTRACT(${body},'$'))`; }))}`);
        await tx.$executeRaw`INSERT INTO PublicCacheTag(tag,generation) VALUES('demo:source-comparison',1)
          ON DUPLICATE KEY UPDATE generation=generation+1`;
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
    }
  }
}

/** Reads only sealed, pre-generated replay artifacts; never reconstructs forecasts or calls the provider. */
export async function readDemoSourcePairs(tx: Tx, revisions: readonly StoredRevision[], maxBytes = demoSourcePairRules.maximumReadBytes): Promise<ReadonlyMap<string, ForecastSourceReceipts>> {
  assertDemoDatabase();
  const [database] = await tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
  if (!database || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(database.name) || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > demoSourcePairRules.maximumReadBytes) {
    throw new Error("Synthetic source pair read requires its bounded isolated database.");
  }
  const native = revisions.filter(revision => revision.modelVersionId === demoModel.id), output = new Map<string, ForecastSourceReceipts>();
  let remaining = maxBytes;
  for (let offset = 0; offset < native.length; offset += demoSourcePairRules.batchSize) {
    const batch = native.slice(offset, offset + demoSourcePairRules.batchSize), byId = new Map(batch.map(revision => [revision.id, revision]));
    const from = Prisma.sql`FROM DevelopmentDemoSourcePair WHERE revisionId IN (${Prisma.join([...byId.keys()])})`;
    const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT COALESCE(SUM(OCTET_LENGTH(CAST(body AS CHAR))),0) AS bytes,COUNT(*) AS total ${from}`);
    const bytes = Number(size?.bytes), total = Number(size?.total);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > remaining || !Number.isSafeInteger(total) || total < 0 || total > batch.length) throw new Error("Synthetic source pair read exceeds its bound.");
    remaining -= bytes;
    const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity ${from}`);
    if (rows.length !== total) throw new Error("Synthetic source pair read is incomplete.");
    for (const row of rows) {
      const revision = byId.get(String(row.revisionId));
      if (!revision || output.has(revision.jobId)) throw new Error("Synthetic source pair read identity is invalid.");
      output.set(revision.jobId, validatedSourcePair(row, revision).sources);
    }
  }
  return output;
}
