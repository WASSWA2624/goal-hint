import "server-only";

import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION, ODDS_CONTRACT_VERSION } from "../football/api-football-contract.ts";
import { normalizeOdds } from "../football/api-football-normalize.ts";
import { canonicalOddsValues, oddsValuesHash, storedOddsBatchSchema, storedOddsSnapshotSchema } from "../odds/odds-mysql-store.ts";
import type { StoredQuoteSource } from "../odds/odds-read.ts";
import { assertHistorySeal, historyJson, revisionFromRows, type HistoryRow } from "../predictions/history-read.ts";
import { preparePredictionQuotes, predictionQuoteFromRow, writePreparedPredictionQuotes } from "../predictions/prediction-quote-store.ts";
import { assertDemoDatabase } from "./member.ts";
import { demoHash, demoId, demoModel } from "./forecast.ts";
import { DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY, demoFixtureById, demoFixtureOdds } from "./api-football.ts";

export const demoPublicationQuoteRules = Object.freeze({ bookmakerId: 8, maximumAgeMs: 300_000, revisionBatchSize: 50 });
type Tx = Prisma.TransactionClient;
export type DemoPublicationQuoteTarget = Readonly<{ revisionId: string; cycleId: string; fixtureId: string; externalFixtureId: number;
  homeTeamId: string; awayTeamId: string; publishedAt: number; openedAt: number; cutoffAt: number; kickoffAt: number;
  markets: ResolvedForecastCandidate["markets"] }>;

/** A synthetic original-publication artifact, never a reconstruction in a performance reader.
 * The accepted market, original publication instant and all provider identities are bound first. */
export function prepareDemoPublicationQuotes(target: DemoPublicationQuoteTarget) {
  const observedAt = target.publishedAt - 1_000, fixture = demoFixtureById(target.externalFixtureId, observedAt);
  if (!fixture || target.fixtureId !== demoId("fixture", target.externalFixtureId) || target.revisionId !== demoId("revision", target.externalFixtureId) ||
    target.cycleId !== demoId("cycle", target.externalFixtureId) || target.homeTeamId !== demoId("team", fixture.teams.home.id) ||
    target.awayTeamId !== demoId("team", fixture.teams.away.id) || target.kickoffAt !== fixture.fixture.timestamp * 1_000 ||
    observedAt < target.openedAt || target.publishedAt >= target.cutoffAt || target.cutoffAt > target.kickoffAt) {
    throw new Error("Synthetic original-quote identity or publication chronology is invalid.");
  }
  const raw = demoFixtureOdds(target.externalFixtureId, observedAt, demoPublicationQuoteRules.bookmakerId);
  const normalized = normalizeOdds(raw, { endpoint: "/odds", retrievedAt: utcInstantFromEpochMilliseconds(observedAt) });
  if (!normalized.valid || normalized.data.fixtureId !== target.externalFixtureId || normalized.data.kickoff !== target.kickoffAt) {
    throw new Error("Synthetic original-quote provider response is invalid.");
  }
  const bookmaker = normalized.data.bookmakers.find((row) => row.id === demoPublicationQuoteRules.bookmakerId);
  if (!bookmaker) throw new Error("Synthetic original-quote bookmaker is unavailable.");
  const snapshots = launchOddsMapping.map((mapping) => {
    const bet = bookmaker.bets.find((row) => row.id === mapping.betId);
    if (!bet) throw new Error("Synthetic original-quote market is unavailable.");
    const values = canonicalOddsValues(bet.values), valuesHash = oddsValuesHash(values), previousId = null;
    const identity = { fixtureId: target.fixtureId, bookmakerId: bookmaker.id, bookmakerName: bookmaker.name,
      betId: bet.id, betName: bet.name, valuesHash, previousId };
    return storedOddsSnapshotSchema.parse({ ...identity, id: evidenceFingerprint({ ...identity, observedAt }), retrievedAt: observedAt,
      providerUpdatedAt: normalized.data.source.providerUpdatedAt, retainUntil: Date.parse("2036-01-01T00:00:00Z"), values });
  });
  const source: StoredQuoteSource = { state: { lastRetrievedAt: new Date(observedAt), withdrawnAt: null }, rows: snapshots.flatMap((snapshot) => {
    const mapping = launchOddsMapping.find((entry) => entry.betId === snapshot.betId)!;
    const group = launchOddsGroup(mapping, { betId: snapshot.betId, betName: snapshot.betName, values: snapshot.values }, snapshot.betName ?? undefined);
    if (!group) throw new Error("Synthetic original-quote market mapping failed.");
    return group.selections.map((entry) => ({ marketKey: mapping.family, selection: entry.selection, basis: "bookmaker", bookmakerId: bookmaker.id,
      displayHundredths: entry.displayHundredths, priceDecimal: `${entry.price.scaled / 10_000n}.${String(entry.price.scaled % 10_000n).padStart(4, "0")}`,
      line: mapping.line === null ? null : Number(mapping.line).toFixed(2), method: group.method, mappingVersion: group.mappingVersion,
      snapshotId: snapshot.id, retrievedAt: new Date(observedAt), providerUpdatedAt: snapshot.providerUpdatedAt === null ? null : new Date(snapshot.providerUpdatedAt) }));
  }) };
  const quotes = preparePredictionQuotes({ revisionId: target.revisionId, cycleId: target.cycleId, fixtureId: target.fixtureId,
    recordedAt: target.publishedAt, freshnessMs: demoPublicationQuoteRules.maximumAgeMs, markets: target.markets, source });
  if (!quotes.length || quotes.some((quote) => quote.state !== "quoted")) throw new Error("Synthetic original-publication quotes failed the production contract.");
  const content = { accountId: demoHash("odds-account"), kind: "prices" as const, scopeKey: `demo:publication:${target.externalFixtureId}`,
    policyHash: demoHash("original-publication-odds-policy-v1"), status: "complete" as const, requestsDispatched: 0,
    receivedAt: observedAt, requestId: demoHash(`original-publication-odds:${target.revisionId}`), slot: observedAt,
    date: getReportingDate(utcInstantFromEpochMilliseconds(target.kickoffAt)), contractVersion: ODDS_CONTRACT_VERSION,
    reasons: [], missingCoverage: [], pages: [{ provider: "api-football" as const, endpoint: "odds" as const,
      requestParameters: { fixture: String(target.externalFixtureId), bookmaker: String(bookmaker.id), timezone: "Africa/Kampala" },
      contractVersion: API_FOOTBALL_CONTRACT_VERSION, retrievedAt: observedAt, providerUpdatedAt: normalized.data.source.providerUpdatedAt,
      fromCache: false, currentPage: 1, totalPages: 1 }],
    fixtures: [{ externalId: target.externalFixtureId, observationHash: evidenceFingerprint(normalized.data), outcome: "apply" as const,
      quoteManifest: { bookmakerId: bookmaker.id, kickoffAt: target.kickoffAt, bets: bookmaker.bets.map((bet) => ({ betId: bet.id,
        betName: bet.name, valuesHash: oddsValuesHash(bet.values) })) } }], catalog: [] };
  const batch = storedOddsBatchSchema.parse({ id: evidenceFingerprint(content), ...content });
  return freezeEvidence({ batch, snapshots, quotes });
}

type Capture = ReturnType<typeof prepareDemoPublicationQuotes>;
const validated = new WeakMap<DatabaseRuntime, Promise<void>>();
const completed = new WeakMap<DatabaseRuntime, Set<string>>();
const pending = new WeakMap<DatabaseRuntime, Map<string, Promise<void>>>();

async function validateDatabase(database: DatabaseRuntime) {
  assertDemoDatabase();
  let validation = validated.get(database);
  if (!validation) {
    validation = database.query(async (tx) => {
      const [row] = await tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
      if (!row || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(row.name)) throw new Error("Original demo quotes require their isolated database.");
    }).catch((error) => { validated.delete(database); throw error; });
    validated.set(database, validation);
  }
  await validation;
}

async function insertSources(tx: Tx, captures: readonly Capture[]) {
  if (!captures.length) return;
  const batches = [...new Map(captures.map(({ batch }) => [batch.id, batch])).values()];
  const snapshots = [...new Map(captures.flatMap((capture) => capture.snapshots.map((snapshot) =>
    [snapshot.id, { snapshot, batchId: capture.batch.id }] as const))).values()];
  const batchIds = batches.map((batch) => batch.id), snapshotIds = snapshots.map(({ snapshot }) => snapshot.id);
  const batchRows = () => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM OddsImportBatch WHERE id IN (${Prisma.join(batchIds)})`);
  const snapshotRows = () => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM ProviderOddsSnapshot WHERE id IN (${Prisma.join(snapshotIds)})`);
  const verifyBatch = (row: HistoryRow, expected: Capture["batch"]) => {
    assertHistorySeal(row.validIntegrity);
    const value = storedOddsBatchSchema.parse(historyJson(row.body));
    if (evidenceFingerprint(value) !== evidenceFingerprint(expected) || row.id !== value.id || row.accountId !== value.accountId ||
      row.kind !== value.kind || row.scopeKey !== value.scopeKey || row.policyHash !== value.policyHash || row.status !== value.status ||
      Number(row.requestsDispatched) !== value.requestsDispatched || !(row.receivedAt instanceof Date) || row.receivedAt.getTime() !== value.receivedAt) {
      throw new Error("Conflicting immutable original demo odds receipt.");
    }
  };
  const verifySnapshot = (row: HistoryRow, expected: typeof snapshots[number]) => {
    assertHistorySeal(row.validIntegrity);
    const value = storedOddsSnapshotSchema.parse(historyJson(row.body));
    const time = (candidate: unknown) => candidate === null ? null : candidate instanceof Date ? candidate.getTime() : Number.NaN;
    if (evidenceFingerprint(value) !== evidenceFingerprint(expected.snapshot) || row.id !== value.id || row.fixtureId !== value.fixtureId ||
      row.batchId !== expected.batchId || row.previousId !== value.previousId || Number(row.bookmakerExternalId) !== value.bookmakerId ||
      row.bookmakerName !== value.bookmakerName || Number(row.betExternalId) !== value.betId || row.betName !== value.betName ||
      row.valuesHash !== value.valuesHash || Number(row.selectionCount) !== value.values.length || time(row.retrievedAt) !== value.retrievedAt ||
      time(row.providerUpdatedAt) !== value.providerUpdatedAt || time(row.retainUntil) !== value.retainUntil) {
      throw new Error("Conflicting immutable original demo odds source.");
    }
  };
  const existingBatches = new Map((await batchRows()).map((row) => [row.id, row]));
  const existingSnapshots = new Map((await snapshotRows()).map((row) => [row.id, row]));
  for (const batch of batches) { const row = existingBatches.get(batch.id); if (row) verifyBatch(row, batch); }
  for (const snapshot of snapshots) { const row = existingSnapshots.get(snapshot.snapshot.id); if (row) verifySnapshot(row, snapshot); }
  const newBatches = batches.filter((batch) => !existingBatches.has(batch.id));
  if (newBatches.length) await tx.$executeRaw(Prisma.sql`INSERT INTO OddsImportBatch
    (id,accountId,kind,scopeKey,policyHash,status,requestsDispatched,receivedAt,integrity,body)
    VALUES ${Prisma.join(newBatches.map((batch) => {
      const body = evidenceSerialize(batch);
      return Prisma.sql`(${batch.id},${batch.accountId},${batch.kind},${batch.scopeKey},${batch.policyHash},${batch.status},0,
        ${new Date(batch.receivedAt)},SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256),JSON_EXTRACT(${body},'$'))`;
    }))}`);
  const newSnapshots = snapshots.filter(({ snapshot }) => !existingSnapshots.has(snapshot.id));
  for (let offset = 0; offset < newSnapshots.length; offset += 100) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO ProviderOddsSnapshot
      (id,fixtureId,batchId,previousId,bookmakerExternalId,bookmakerName,betExternalId,betName,valuesHash,selectionCount,
        retrievedAt,providerUpdatedAt,retainUntil,integrity,body)
      VALUES ${Prisma.join(newSnapshots.slice(offset, offset + 100).map(({ snapshot, batchId }) => {
        const body = evidenceSerialize(snapshot);
        return Prisma.sql`(${snapshot.id},${snapshot.fixtureId},${batchId},${snapshot.previousId},${snapshot.bookmakerId},${snapshot.bookmakerName},
          ${snapshot.betId},${snapshot.betName},${snapshot.valuesHash},${snapshot.values.length},${new Date(snapshot.retrievedAt)},
          ${snapshot.providerUpdatedAt === null ? null : new Date(snapshot.providerUpdatedAt)},${new Date(snapshot.retainUntil)},
          SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256),JSON_EXTRACT(${body},'$'))`;
      }))}`);
  }
  const persistedBatches = new Map((await batchRows()).map((row) => [row.id, row]));
  const persistedSnapshots = new Map((await snapshotRows()).map((row) => [row.id, row]));
  for (const batch of batches) { const row = persistedBatches.get(batch.id); if (!row) throw new Error("Missing original demo receipt."); verifyBatch(row, batch); }
  for (const snapshot of snapshots) { const row = persistedSnapshots.get(snapshot.snapshot.id); if (!row) throw new Error("Missing original demo snapshot."); verifySnapshot(row, snapshot); }
}

async function seedDate(database: DatabaseRuntime, date: string, nowMs: number) {
  let after = "";
  for (;;) {
    const rows = await database.query((tx) => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
      r.integrity=SHA2(CONCAT(r.id,':',r.requestHash,':',CAST(r.candidateJson AS CHAR)),256) AS validIntegrity,
      f.externalId AS externalFixtureId,f.provider AS fixtureProvider,f.homeTeamId,f.awayTeamId,
      c.openedAt AS originalOpenedAt,c.cutoffAt AS originalCutoffAt,c.kickoffAt AS originalKickoffAt
      FROM PredictionSet r JOIN FootballFixture f ON f.id=r.fixtureId JOIN PredictionCycle c ON c.id=r.cycleId AND c.fixtureId=r.fixtureId
      WHERE f.eatDate=${new Date(`${date}T00:00:00Z`)} AND f.provider='api-football' AND r.modelVersionId=${demoModel.id}
        AND r.publishedAt<=${new Date(nowMs)} AND r.id>${after}
        AND (SELECT COUNT(*) FROM PredictionQuote q WHERE q.revisionId=r.id)<4
      ORDER BY r.id LIMIT ${demoPublicationQuoteRules.revisionBatchSize}`));
    if (!rows.length) break;
    after = String(rows.at(-1)!.id);
    const revisionIds = rows.map((row) => String(row.id));
    const markets = await database.query((tx) => tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
      integrity=SHA2(CAST(payloadJson AS CHAR),256) AS validIntegrity FROM MarketPrediction WHERE setId IN (${Prisma.join(revisionIds)})`));
    const captures = rows.map((row) => {
      const revision = revisionFromRows(row, markets.filter((market) => market.setId === row.id));
      const at = (value: unknown) => { if (!(value instanceof Date)) throw new Error("Invalid original demo publication instant."); return value.getTime(); };
      return prepareDemoPublicationQuotes({ revisionId: revision.id, cycleId: revision.cycleId, fixtureId: revision.fixtureId,
        externalFixtureId: Number(row.externalFixtureId), homeTeamId: String(row.homeTeamId), awayTeamId: String(row.awayTeamId),
        publishedAt: revision.publishedAt, openedAt: at(row.originalOpenedAt), cutoffAt: at(row.originalCutoffAt), kickoffAt: at(row.originalKickoffAt),
        markets: revision.candidate.markets });
    });
    await database.transaction(async (tx) => {
      // Match the existing demo writer's account-first lock order. No forecast,
      // cycle, current price, editorial publication or saved slip is modified.
      await tx.$queryRaw`SELECT id FROM ApiQuotaAccount WHERE id=${demoHash("odds-account")} FOR UPDATE`;
      const existingRows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
        FROM PredictionQuote WHERE revisionId IN (${Prisma.join(revisionIds)})`);
      const existing = new Map(existingRows.map((row) => { const quote = predictionQuoteFromRow(row); return [`${quote.revisionId}:${quote.family}`, quote]; }));
      const fresh = captures.flatMap((capture) => capture.quotes.filter((quote) => {
        const prior = existing.get(`${quote.revisionId}:${quote.family}`);
        if (prior && evidenceFingerprint(prior) !== evidenceFingerprint(quote)) throw new Error("Conflicting original demo prediction quote.");
        return !prior;
      }));
      if (!fresh.length) return;
      await insertSources(tx, captures);
      await writePreparedPredictionQuotes(tx, fresh);
      // Capture finishes before the performance cache probe. Its demo quote policy
      // has its own scope, while existing forecast tags cover later cohort growth.
      // Sidecars do not change feed/card rows and must not invalidate their paging.
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  }
  const [coverage] = await database.query((tx) => tx.$queryRaw<{ revisions: bigint; quotes: bigint }[]>`SELECT COUNT(*) AS revisions,
    COALESCE(SUM((SELECT COUNT(*) FROM PredictionQuote q WHERE q.revisionId=r.id)),0) AS quotes
    FROM PredictionSet r JOIN FootballFixture f ON f.id=r.fixtureId WHERE f.eatDate=${new Date(`${date}T00:00:00Z`)}
      AND f.provider='api-football' AND r.modelVersionId=${demoModel.id} AND r.publishedAt<=${new Date(nowMs)}`);
  if (Number(coverage?.revisions) === DEMO_MATCHES_PER_DAY && Number(coverage?.quotes) === DEMO_MATCHES_PER_DAY * 4) {
    const dates = completed.get(database) ?? new Set<string>(); dates.add(date); completed.set(database, dates);
  }
}

/** Append only absent synthetic original-publication sidecars, after rich forecasts exist.
 * Production historical quotes are never backfilled and no live provider request is made. */
export async function ensureDemoPublicationQuotes(database: DatabaseRuntime, dates: readonly string[], nowMs = Date.now()): Promise<void> {
  await validateDatabase(database);
  const queue = pending.get(database) ?? new Map<string, Promise<void>>(); pending.set(database, queue);
  for (const date of [...new Set(dates)]) {
    parseReportingDate(date);
    if (date < DEMO_START_DATE || date > DEMO_END_DATE || completed.get(database)?.has(date)) continue;
    let operation = queue.get(date);
    if (!operation) {
      operation = seedDate(database, date, nowMs).finally(() => queue.delete(date));
      queue.set(date, operation);
    }
    await operation;
  }
}
