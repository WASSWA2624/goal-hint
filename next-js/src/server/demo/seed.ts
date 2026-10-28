import "server-only";

import { setTimeout as retryDelay } from "node:timers/promises";
import { z } from "zod";

import { addReportingDays, createPredictionWindow, getPublicationDeadline, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketSelections, MARKET_RULE_VERSION, type MarketFamily } from "../../domain/markets.ts";
import { isPlayedFinalStatus, settleMarketSelection, type SettlementStatus } from "../../domain/market-settlement.ts";
import { liveMatchMetrics, liveMatchSnapshotSchema } from "../../domain/live-match.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { evidenceFingerprint, evidenceSerialize } from "../evidence/evidence-input.ts";
import { catalogScopeKey } from "../football/catalog-input.ts";
import { normalizeFixture, normalizeStatistics, normalizeEvent } from "../football/api-football-normalize.ts";
import { demoFixtureEvents, demoFixtureStatistics, demoFixtureOdds, demoFixturesForDate, DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY,
  type ApiFootballDemoFixture } from "./api-football.ts";
import { demoFootballCatalog } from "./api-football-catalog.ts";
import { demoForecast, demoHash, demoId, demoModel } from "./forecast.ts";
import { seedDemoMember } from "./member-seed.ts";
import { assertDemoDatabase as assertDemoEnvironment } from "./member.ts";
import { ensureDemoPublicationQuotes } from "./publication-quotes.ts";
import { seedDemoWorkspace } from "./workspace-seed.ts";
import { ensureDemoSourcePairs } from "./source-receipts.ts";
import { parseSelectionPolicy } from "../selection/selection-input.ts";
import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import { canonicalOddsValues, oddsValuesHash } from "../odds/odds-mysql-store.ts";
import { ODDS_CONTRACT_VERSION } from "../football/api-football-contract.ts";
import { cycleEligibilityFor } from "../settlement/settlement-read.ts";
import { historyJson } from "../predictions/history-read.ts";
import { parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";

const VERSION = "development-demo-v1", emptySeal = "0".repeat(64);
let seedStage = "database validation";
type Tx = Prisma.TransactionClient;
type SqlValue = string | number | bigint | boolean | Date | null | Readonly<{ json: unknown }>;
type SqlRow = Record<string, SqlValue>;
const primaryKeys: Readonly<Record<string, readonly string[]>> = {
  FootballCompetition: ["id"], FootballCompetitionProvider: ["provider", "externalId"], FootballSeason: ["id"], FootballTeam: ["id"],
  FootballTeamProvider: ["provider", "externalId"], FootballVenue: ["provider", "externalId"], ModelVersion: ["id"], ApiQuotaAccount: ["id"],
  FootballFixture: ["id"], FootballImport: ["id"], DailyRun: ["id"], DailyRunManifest: ["runId"], PredictionCycle: ["id"], PredictionSchedule: ["id"],
  EvidenceSourceVersion: ["id"], FixtureEvidenceSnapshot: ["requestId"], FixtureEvidenceSnapshotSource: ["requestId", "sourceVersionId"],
  PredictionSet: ["id"], MarketPrediction: ["setId", "family"], OddsImportBatch: ["id"], FixtureResult: ["id"], FixtureResultState: ["fixtureId"],
  ProviderOddsSnapshot: ["id"], FixtureOddsState: ["fixtureId"], FixtureOddsPrice: ["fixtureId", "marketKey", "selection"],
  FixtureFacts: ["fixtureId"], LiveMatchSnapshot: ["id"], SettlementBatch: ["id"], MarketSettlementRevision: ["id"], MarketSettlement: ["cycleId", "family"],
};
const json = (value: unknown): SqlValue => ({ json: value });
const dateAt = (value: number | null) => value === null ? null : new Date(value);
const dateValue = (date: string) => new Date(`${date}T00:00:00Z`);
const days = () => Array.from({ length: Math.round((Date.parse(DEMO_END_DATE) - Date.parse(DEMO_START_DATE)) / 86_400_000) + 1 }, (_, n) => addReportingDays(parseReportingDate(DEMO_START_DATE), n));
const inRange = (date: string) => date >= DEMO_START_DATE && date <= DEMO_END_DATE;
const selectionPolicy = parseSelectionPolicy({ version: 1, evidenceRef: VERSION, competitionIds: demoFootballCatalog.leagues.map((league) => league.id),
  eligibleStatuses: ["scheduled"], degradationPolicyRef: null, retentionEvidenceRef: VERSION, leaseMs: 1000, attemptsPerInvocation: 1,
  maxFixtures: 10_000, importBounds: { priority: "daily-inputs", deadlineMs: 120_000, timeoutMs: 10_000, maxRequests: 1, maxPages: 1,
    maxRows: 10_000, maxResponseBytes: 10_000_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
  refresh: { type: "development.demo", handlerVersion: 1, payload: {}, maxAttempts: 1, timeoutMs: 1000, leaseMs: 1000,
    fallbackReserveMs: 0, backoff: { baseMs: 100, maxMs: 100 } } });

function transactionConflict(error: unknown): boolean {
  const queue: unknown[] = [error], seen = new Set<object>();
  while (queue.length) {
    const entry = queue.shift();
    if (entry === null || typeof entry !== "object" || seen.has(entry)) continue;
    seen.add(entry);
    const value = entry as Record<string, unknown>;
    if (value.code === "P2034" || [value.code, value.originalCode, value.errno].some((code) => String(code) === "1213")
      || value.sqlState === "40001" || value.sqlstate === "40001") return true;
    for (const key of ["meta", "cause", "driverAdapterError", "originalError"]) if (value[key] !== undefined) queue.push(value[key]);
  }
  return false;
}

/** Local deterministic writes have no external effects. ReadCommitted avoids anti-join gap locks;
 * only genuine MySQL serialization/deadlock conflicts may retry, at most three attempts. */
async function demoWrite<T>(database: DatabaseRuntime, operation: (tx: Tx) => Promise<T>, timeout = 120_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        try {
          // Demo cohorts share public cache-generation rows. Acquire their dedicated
          // synthetic account first so concurrent dates cannot invert that lock order.
          await tx.$queryRaw`SELECT id FROM ApiQuotaAccount WHERE id=${demoHash("odds-account")} FOR UPDATE`;
          return await operation(tx);
        }
        catch (error) {
          // The shared boundary deliberately withholds raw driver metadata. Preserve its
          // existing conflict classification before the private MySQL details are removed.
          if (transactionConflict(error)) throw Object.assign(new Error("Synthetic write conflict."), { code: "P2034" });
          throw error;
        }
      }, { isolationLevel: "ReadCommitted", timeout });
    } catch (error) {
      if (!(error instanceof DatabaseOperationError) || error.code !== "conflict" || attempt >= 2) throw error;
      await retryDelay(25 * (attempt + 1));
    }
  }
}

/** Identifiers are internal constants; all data values remain SQL parameters. Chunking bounds packets and memory. */
async function insertRows(tx: Tx, table: string, rows: readonly SqlRow[], update: readonly string[] = []) {
  if (!rows.length) return;
  seedStage = table;
  const columns = Object.keys(rows[0]!);
  const quote = (value: string) => Prisma.raw(`\`${value}\``);
  const seal = (entry: SqlRow) => {
    const body = (column: string) => {
      const value = entry[column];
      if (value === null || typeof value !== "object" || !("json" in value)) throw new Error("Missing demo seal payload.");
      return Prisma.sql`CAST(JSON_EXTRACT(${evidenceSerialize(value.json)}, '$') AS CHAR CHARACTER SET utf8mb4)`;
    };
    if (table === "ModelVersion") return Prisma.sql`SHA2(CONCAT(${entry.id}, ':', ${body("configurationJson")}),256)`;
    if (table === "FixtureEvidenceSnapshot") return Prisma.sql`SHA2(CONCAT(${entry.requestId}, ':', ${entry.requestFingerprint}, ':', ${body("snapshotJson")}),256)`;
    if (table === "PredictionSet") return Prisma.sql`SHA2(CONCAT(${entry.id}, ':', ${entry.requestHash}, ':', ${body("candidateJson")}),256)`;
    const column = table === "EvidenceSourceVersion" ? "metadataJson" : table === "MarketPrediction" ? "payloadJson"
      : table === "LiveMatchSnapshot" ? "bodyJson" : "body";
    return Prisma.sql`SHA2(${body(column)},256)`;
  };
  for (let offset = 0; offset < rows.length; offset += 100) {
    const incoming = rows.slice(offset, offset + 100).map((entry) => columns.map((column) => {
      const value = entry[column] ?? null;
      if (column === "integrity" && value === emptySeal) return seal(entry);
      // MySQL infers a common numeric type across a multi-row VALUES constructor.
      // Pin each probability to DOUBLE so its binary64 value matches the sealed JSON
      // exactly, including values differing only in the final decimal place.
      if (table === "MarketPrediction" && typeof value === "number" && (column.startsWith("probability") || column === "selectedProbability")) {
        return Prisma.sql`CAST(${String(value)} AS DOUBLE)`;
      }
      return value !== null && typeof value === "object" && !(value instanceof Date) && "json" in value
        ? Prisma.sql`JSON_EXTRACT(${evidenceSerialize(value.json)}, '$')` : Prisma.sql`${value}`;
    }));
    const assignments = update.length ? Prisma.sql` ON DUPLICATE KEY UPDATE ${Prisma.join(update.map((column) => table === "FootballFixture"
      ? Prisma.sql`${quote(column)}=IF(VALUES(retrievedAt)>=retrievedAt,VALUES(${quote(column)}),${quote(column)})`
      : Prisma.sql`${quote(column)}=VALUES(${quote(column)})`))}` : Prisma.empty;
    try {
      if (update.length) {
        const values = incoming.map((entry) => Prisma.sql`(${Prisma.join(entry)})`);
        await tx.$executeRaw(Prisma.sql`INSERT INTO ${quote(table)} (${Prisma.join(columns.map(quote))}) VALUES ${Prisma.join(values)}${assignments}`);
      } else {
        const keys = primaryKeys[table];
        if (!keys) throw new Error("Unknown synthetic data table.");
        const selects = incoming.map((entry, index) => Prisma.sql`SELECT ${Prisma.join(entry.map((value, column) => index === 0 ? Prisma.sql`${value} AS ${quote(columns[column]!)}` : value))}`);
        const match = Prisma.join(keys.map((key) => Prisma.sql`existing.${quote(key)}=incoming.${quote(key)}`), " AND ");
        // Strict inserts keep every native CHECK and truncation error visible.
        // The anti-join provides idempotency without suppressing failed rows.
        await tx.$executeRaw(Prisma.sql`INSERT INTO ${quote(table)} (${Prisma.join(columns.map(quote))})
          SELECT incoming.* FROM (${Prisma.join(selects, " UNION ALL ")}) incoming
          WHERE NOT EXISTS (SELECT 1 FROM ${quote(table)} existing WHERE ${match})`);
      }
    }
    catch (error) {
      if (transactionConflict(error)) throw error;
      const diagnostic = error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalMessage?: string; code?: unknown } } } };
      const cause = diagnostic.meta?.driverAdapterError?.cause;
      const constraint = cause?.originalMessage?.match(/(?:constraint|CONSTRAINT)\s+['`"]?([A-Za-z0-9_]+)/u)?.[1];
      process.stderr.write(`Demo insert failed in ${table}${constraint ? ` (${constraint})` : ""}; code ${String(cause?.code ?? diagnostic.code ?? "unknown")}.\n`);
      throw error;
    }
  }
}

const readyMarkerVersion = `${VERSION}:readiness-v1`;
type PreparationState = {
  version: string;
  catalog: WeakMap<DatabaseRuntime, Promise<void>>;
  pending: WeakMap<DatabaseRuntime, Map<string, Promise<void>>>;
  refreshed: WeakMap<DatabaseRuntime, Map<string, number>>;
};
const processState = globalThis as typeof globalThis & { goalHintDemoPreparation?: PreparationState };
// getDatabase survives route bundles and development reloads. Its preparation
// promises must have the same lifetime to avoid duplicate catalog/date writes.
const preparation = processState.goalHintDemoPreparation?.version === readyMarkerVersion
  ? processState.goalHintDemoPreparation
  : (processState.goalHintDemoPreparation = { version: readyMarkerVersion,
    catalog: new WeakMap(), pending: new WeakMap(), refreshed: new WeakMap() });
const ready = preparation.catalog;
async function assertDemoDatabase(database: DatabaseRuntime) {
  assertDemoEnvironment();
  if (!isDevelopmentDemo()) throw new Error("Demo data is available only in development demo mode.");
  const [row] = await database.query((tx) => tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`);
  if (!row || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(row.name)) throw new Error("Demo seeding requires its isolated goal_hint_demo database.");
}

async function seedCatalog(database: DatabaseRuntime, nowMs: number) {
  seedStage = "database validation";
  await assertDemoDatabase(database);
  const at = new Date(nowMs - 1000);
  await demoWrite(database, async (tx) => {
    const leagues = demoFootballCatalog.leagues, teams = demoFootballCatalog.teams;
    await insertRows(tx, "FootballCompetition", leagues.map((league) => ({ id: demoId("competition", league.id), name: league.name,
      nameSearch: league.name.toLowerCase(), country: league.country, countrySearch: league.country.toLowerCase(), type: league.type,
      logoUrl: `https://flagcdn.com/w80/${league.countryCode.toLowerCase()}.png`, countryFlagUrl: `https://flagcdn.com/w80/${league.countryCode.toLowerCase()}.png`,
      retrievedAt: at, createdAt: at, updatedAt: at })));
    await insertRows(tx, "FootballCompetitionProvider", leagues.map((league) => ({ provider: "api-football", externalId: BigInt(league.id),
      competitionId: demoId("competition", league.id), evidenceRef: VERSION, sourceRef: VERSION, mappedAt: at })));
    await insertRows(tx, "FootballSeason", leagues.map((league) => ({ id: demoId("season", league.id), competitionId: demoId("competition", league.id), year: 2026,
      current: true, coverage: json({ fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true }, standings: true,
        players: true, top_scorers: true, top_assists: true, top_cards: true, injuries: true, predictions: true, odds: true }), retrievedAt: at })));
    await insertRows(tx, "FootballTeam", teams.map((team) => ({ id: demoId("team", team.id), name: team.name, nameSearch: team.name.toLowerCase(),
      code: team.code, country: team.country, countrySearch: team.country.toLowerCase(), national: false, logoUrl: team.logo, retrievedAt: at, createdAt: at, updatedAt: at })));
    await insertRows(tx, "FootballTeamProvider", teams.map((team) => ({ provider: "api-football", externalId: BigInt(team.id), teamId: demoId("team", team.id),
      evidenceRef: VERSION, sourceRef: VERSION, mappedAt: at })));
    await insertRows(tx, "FootballVenue", teams.map((team) => ({ provider: "api-football", externalId: BigInt(team.venue.id), status: "available",
      name: team.venue.name, city: team.venue.city, country: team.country, capacity: team.venue.capacity, surface: team.venue.surface, retrievedAt: at, checkedAt: at })));
    await insertRows(tx, "ModelVersion", [{ id: demoModel.id, provider: demoModel.provider, model: demoModel.model,
      providerModelVersion: demoModel.providerModelVersion, contractVersion: demoModel.contractVersion, promptVersion: demoModel.promptVersion,
      schemaVersion: demoModel.schemaVersion, calibrationKind: demoModel.calibration.kind, calibrationVersion: demoModel.calibration.version,
      evaluationStatus: demoModel.evaluation.status, evaluationVersion: demoModel.evaluation.version, integrity: emptySeal, configurationJson: json(demoModel) }]);
    await insertRows(tx, "ApiQuotaAccount", [{ id: demoHash("odds-account"), stateJson: null }]);
  });
  seedStage = "demo member";
  await seedDemoMember(database);
}

function ensureCatalog(database: DatabaseRuntime, nowMs: number) {
  let promise = ready.get(database);
  if (!promise) { promise = seedCatalog(database, nowMs).catch((error) => {
    ready.delete(database); process.stderr.write(`Demo initialization failed during ${seedStage}.\n`); throw error;
  }); ready.set(database, promise); }
  return promise;
}

function normalized(fixture: ApiFootballDemoFixture, nowMs: number) {
  const result = normalizeFixture(fixture, { endpoint: "/fixtures", retrievedAt: utcInstantFromEpochMilliseconds(nowMs - 1000),
    verifyLogo: () => true, verifyRegulationScore: () => true, verifyHalfTimeScore: () => true });
  if (!result.valid || result.data.kickoff === null) throw new Error("Invalid synthetic fixture contract.");
  return result.data;
}

function fixtureRow(raw: ApiFootballDemoFixture, nowMs: number): SqlRow {
  const fixture = normalized(raw, nowMs), verified = fixture.regulationScore?.verified === true;
  const at = new Date(nowMs - 1000);
  return { id: demoId("fixture", fixture.id), provider: "api-football", externalId: BigInt(fixture.id),
    homeTeamId: demoId("team", fixture.homeTeam.id), awayTeamId: demoId("team", fixture.awayTeam.id), seasonId: demoId("season", fixture.competition.id),
    round: fixture.competition.round, kickoff: new Date(fixture.kickoff!), eatDate: dateValue(getReportingDate(fixture.kickoff!)), status: fixture.status,
    providerStatus: fixture.providerStatus, elapsedMinutes: fixture.elapsedMinutes, regulationHome: verified ? fixture.regulationScore!.home : null,
    regulationAway: verified ? fixture.regulationScore!.away : null, regulationEvidenceRef: verified ? VERSION : null,
    regulationVerifiedAt: verified ? at : null, retrievedAt: at, dataVersion: 1n, createdAt: at, updatedAt: at };
}

async function seedFixtureDay(database: DatabaseRuntime, date: string, nowMs: number, update = false, changed?: readonly ApiFootballDemoFixture[]) {
  const fixtures = demoFixturesForDate(date, nowMs), at = new Date(nowMs - 1000), id = demoId("import", date);
  await demoWrite(database, async (tx) => {
    await insertRows(tx, "FootballFixture", (changed ?? fixtures).map((fixture) => fixtureRow(fixture, nowMs)), update ? ["status", "providerStatus", "elapsedMinutes", "regulationHome", "regulationAway", "regulationEvidenceRef", "regulationVerifiedAt", "retrievedAt", "updatedAt"] : []);
    await insertRows(tx, "FootballImport", [{ id, fingerprint: demoHash(`import:${date}`), requestFingerprint: demoHash(`request:${date}`),
      selection: json({ kind: "fixtures", query: { date } }), scopeKey: catalogScopeKey({ kind: "fixtures", query: { date: parseReportingDate(date) } }),
      provider: "api-football", kind: "fixtures", status: "complete", observedAt: at, recordedAt: at,
      receivedCount: fixtures.length, importedCount: fixtures.length, rejectedCount: 0, requestsDispatched: 0,
      reasons: json([]), missingIds: json([]), missingCoverage: json([]), provenance: json([]), retentionEvidenceRef: VERSION,
      fixtureIds: json(fixtures.map((fixture) => demoId("fixture", fixture.fixture.id))), changedFixtureIds: json([]) }]);
  }, 60_000);
  return fixtures;
}

async function seedForecasts(tx: Tx, fixtures: readonly ApiFootballDemoFixture[], nowMs: number) {
  if (!fixtures.length) return;
  const forecasts = fixtures.map((fixture) => demoForecast(fixture, nowMs));
  const date = forecasts[0]!.date, runId = forecasts[0]!.runId;
  const window = createPredictionWindow(parseReportingDate(date)), selectionHash = evidenceFingerprint(selectionPolicy);
  await insertRows(tx, "DailyRun", [{ id: runId, sequence: BigInt(date.replaceAll("-", "")), eatDate: dateValue(date), createdAt: new Date(Math.min(...forecasts.map((f) => f.context.analysisAt))),
    selectionHash, selectionJson: json(selectionPolicy), windowStart: new Date(window.startInclusive), windowEnd: new Date(window.endExclusive),
    committedAt: new Date(nowMs - 1000), partial: false, fence: 0, totalJobs: 0, completedJobs: 0, terminalJobs: 0 }]);
  // Simulation materializes accepted forecasts without dispatching paid worker jobs.
  const manifest = { version: 1, runId, runDate: date, sequence: date.replaceAll("-", ""), selectionHash,
    startInclusive: window.startInclusive, endExclusive: window.endExclusive, committedAt: nowMs - 1000, partial: false,
    degradedAction: null, entries: [], exclusions: [], coverage: Array.from({ length: 7 }, (_, n) => ({ date: addReportingDays(parseReportingDate(date), n),
      status: "complete", importId: null, fixtureIds: [], reasons: [], missingCoverage: [], provenance: [] })) };
  await insertRows(tx, "DailyRunManifest", [{ runId, manifestHash: evidenceFingerprint(manifest), manifestJson: json(manifest) }]);
  await insertRows(tx, "PredictionCycle", forecasts.map((f) => ({ id: f.cycleId, fixtureId: f.fixtureId, creationKey: demoHash(`cycle:${f.fixtureId}`),
    creationHash: demoHash(`cycle-create:${f.fixtureId}`), ordinal: 1, version: 1, scheduleVersion: 1, kickoffAt: new Date(f.context.kickoffAt),
    cutoffAt: new Date(getPublicationDeadline(f.context.kickoffAt)), openedAt: new Date(f.context.analysisAt), state: "open" })));
  await insertRows(tx, "PredictionSchedule", forecasts.map((f) => ({ id: demoId("schedule", f.fixtureId), fixtureId: f.fixtureId, cycleId: f.cycleId, version: 1,
    kickoffAt: new Date(f.context.kickoffAt), cutoffAt: new Date(getPublicationDeadline(f.context.kickoffAt)), observedAt: new Date(f.context.analysisAt),
    providerObservedAt: new Date(f.context.analysisAt), actor: VERSION, reason: "Synthetic development schedule", evidenceRef: VERSION })));
  await insertRows(tx, "EvidenceSourceVersion", forecasts.map((f) => ({ id: f.source.id, fixtureId: f.fixtureId, homeTeamId: f.context.home.teamId,
    awayTeamId: f.context.away.teamId, fixtureVersion: 1n, sourceKey: f.source.sourceKey, kind: f.source.kind, version: f.source.version,
    publisher: f.source.publisher, title: f.source.title, sourceUrl: null, publishedAt: dateAt(f.source.publishedAt), retrievedAt: new Date(f.source.retrievedAt),
    providerUpdatedAt: dateAt(f.source.providerUpdatedAt), retainUntil: new Date(f.source.reuse.retainUntil), integrity: emptySeal, metadataJson: json(f.source) })));
  await insertRows(tx, "FixtureEvidenceSnapshot", forecasts.map((f) => ({ requestId: f.requestId, requestFingerprint: demoHash(`evidence:${f.fixtureId}`),
    contentHash: f.snapshot.hash, fixtureId: f.fixtureId, homeTeamId: f.context.home.teamId, awayTeamId: f.context.away.teamId, fixtureVersion: 1n,
    analysisAt: new Date(f.context.analysisAt), cutoffAt: new Date(f.context.cutoffAt), kickoffAt: new Date(f.context.kickoffAt), cycleId: f.cycleId,
    runId: f.runId, policyVersion: f.snapshot.policy.version, sufficient: f.snapshot.coverage.sufficient, integrity: emptySeal, snapshotJson: json(f.snapshot) })));
  await insertRows(tx, "FixtureEvidenceSnapshotSource", forecasts.map((f) => ({ requestId: f.requestId, sourceVersionId: f.source.id,
    fixtureId: f.fixtureId, homeTeamId: f.context.home.teamId, awayTeamId: f.context.away.teamId, fixtureVersion: 1n })));
  await insertRows(tx, "PredictionSet", forecasts.map((f) => ({ id: f.revisionId, fixtureId: f.fixtureId, fixtureVersion: 1n, cycleId: f.cycleId,
    runId: f.runId, runSequence: BigInt(f.date.replaceAll("-", "")), jobId: f.jobId, fixtureRevision: 1, cycleRevision: 1, scheduleVersion: 1,
    modelVersionId: demoModel.id, evidenceSnapshotId: f.requestId, evidenceHash: f.snapshot.hash, evidenceCutoffAt: new Date(f.context.cutoffAt),
    generationCompletedAt: new Date(f.publishedAt - 1000), publishedAt: new Date(f.publishedAt), recordedAt: new Date(f.publishedAt),
    ruleVersion: MARKET_RULE_VERSION, requestHash: f.requestHash, integrity: emptySeal, candidateJson: json(f.candidate) })));
  await insertRows(tx, "MarketPrediction", forecasts.flatMap((f) => forecastMarketRows(f.revisionId, f.candidate)));
  await assertMarketCounts(tx, forecasts.map((f) => f.revisionId));
}

function forecastMarketRows(setId: string, candidate: ResolvedForecastCandidate): SqlRow[] {
  return Object.entries(candidate.markets).map(([family, item]) => {
    const probabilities = item.available ? marketSelections[family as MarketFamily].map((selection) => (item.market.probabilities as Record<string, number>)[selection]!) : [];
    return { setId, family, available: item.available, source: item.available ? item.market.source : null,
      selection: item.available ? item.market.selection : null, selectedProbability: item.available ? item.market.selectedProbability : null,
      probability1: probabilities[0] ?? null, probability2: probabilities[1] ?? null, probability3: probabilities[2] ?? null,
      unavailableReason: item.available ? null : item.reason, generatedAt: item.available ? dateAt(item.timestamps.generatedAt) : null,
      retrievedAt: item.available ? dateAt(item.timestamps.retrievedAt) : null, providerUpdatedAt: item.available ? dateAt(item.timestamps.providerUpdatedAt) : null,
      integrity: emptySeal, payloadJson: json(item) };
  });
}

async function assertMarketCounts(tx: Tx, ids: readonly string[]) {
  const counts = await tx.marketPrediction.groupBy({ by: ["setId"], where: { setId: { in: [...ids] } }, _count: { _all: true } });
  if (counts.length !== ids.length || counts.some((value) => value._count._all !== 4)) {
    process.stderr.write("Demo forecast projection failed: every accepted revision requires four market families.\n");
    throw new Error("Incomplete synthetic market projection.");
  }
}

async function repairMarketRows(database: DatabaseRuntime, revisionIds: readonly string[]) {
  for (let offset = 0; offset < revisionIds.length; offset += 100) {
    const ids = revisionIds.slice(offset, offset + 100);
    await demoWrite(database, async (tx) => {
      const rows = await tx.predictionSet.findMany({ where: { id: { in: [...ids] } }, select: { id: true, candidateJson: true } });
      await insertRows(tx, "MarketPrediction", rows.flatMap((row) => forecastMarketRows(row.id, parseResolvedForecastCandidate(historyJson(row.candidateJson)))));
      await assertMarketCounts(tx, ids);
    }, 60_000);
  }
}

function resultContent(f: ReturnType<typeof normalized>) {
  const regulation = f.regulationScore?.verified ? { verified: true, home: f.regulationScore.home, away: f.regulationScore.away, evidenceRef: VERSION }
    : { verified: false, home: null, away: null, evidenceRef: null };
  return { status: f.status, providerStatus: f.providerStatus, elapsedMinutes: f.elapsedMinutes, stoppageMinutes: f.stoppageMinutes ?? null,
    reportedGoals: f.reportedGoals, extraTimeScore: f.extraTimeScore, penaltyScore: f.penaltyScore, regulation,
    ...(f.halfTimeScore?.verified ? { halfTime: { verified: true as const, period: "first-half-including-stoppage-time" as const,
      home: f.halfTimeScore.home, away: f.halfTimeScore.away, evidenceRef: VERSION } } : {}) };
}

async function seedObservations(tx: Tx, incoming: readonly ApiFootballDemoFixture[], nowMs: number) {
  const incomingIds = incoming.map((f) => demoId("fixture", f.fixture.id)), observedAt = nowMs - 1000;
  const originalResults = new Map((await tx.fixtureResultState.findMany({ where: { fixtureId: { in: incomingIds } },
    select: { fixtureId: true, firstFinalAt: true, lastSyncAt: true } })).map((result) => [result.fixtureId, result]));
  const originalSnapshots = new Map((await tx.liveMatchSnapshot.findMany({ where: { fixtureId: { in: incomingIds } },
    select: { fixtureId: true, firstFinalAt: true, receivedAt: true } })).map((snapshot) => [snapshot.fixtureId, snapshot]));
  const canonical = new Map((await tx.footballFixture.findMany({ where: { id: { in: incomingIds } },
    select: { id: true, retrievedAt: true } })).map((fixture) => [fixture.id, fixture]));
  // A pinned page request may finish after another process has observed a newer
  // clock. Older observations cannot rewind either the canonical or live projection.
  const fixtures = incoming.filter((raw) => {
    const id = demoId("fixture", raw.fixture.id);
    return [canonical.get(id)?.retrievedAt, originalResults.get(id)?.lastSyncAt, originalSnapshots.get(id)?.receivedAt]
      .every((at) => at === null || at === undefined || at.getTime() <= observedAt);
  });
  if (!fixtures.length) return;
  const fixtureIds = fixtures.map((f) => demoId("fixture", f.fixture.id));
  const originalCycles = new Map((await tx.predictionCycle.findMany({ where: { fixtureId: { in: fixtureIds } },
    select: { fixtureId: true, openedAt: true } })).map((cycle) => [cycle.fixtureId, cycle]));
  // Publication, cutoff and live/result observations change the card projection.
  // The normal client merger requires a newer canonical version for these fields.
  await tx.$executeRaw(Prisma.sql`UPDATE FootballFixture SET dataVersion=dataVersion+1 WHERE id IN (${Prisma.join(fixtureIds)})`);
  const versions = new Map((await tx.footballFixture.findMany({ where: { id: { in: fixtureIds } }, select: { id: true, dataVersion: true } }))
    .map((fixture) => [fixture.id, fixture.dataVersion]));
  const markets = await tx.marketPrediction.findMany({ where: { setId: { in: fixtures.map((f) => demoId("revision", f.fixture.id)) } } });
  const previous = await tx.marketSettlement.findMany({ where: { fixtureId: { in: fixtureIds } }, include: { revision: true } });
  const results: SqlRow[] = [], states: SqlRow[] = [], cycleRows: SqlRow[] = [], prices: SqlRow[] = [], snapshots: SqlRow[] = [],
    facts: SqlRow[] = [], batches: SqlRow[] = [], revisions: SqlRow[] = [], pointers: SqlRow[] = [], oddsSnapshots: SqlRow[] = [], oddsStates: SqlRow[] = [];
  const date = getReportingDate(utcInstantFromEpochMilliseconds(Date.parse(fixtures[0]!.fixture.date)));
  const oddsBatchId = demoHash(`odds-batch:${date}`), accountId = demoHash("odds-account"), policyHash = demoHash("odds-policy");
  const oddsBatch = { id: oddsBatchId, accountId, kind: "prices", scopeKey: `demo:${date}`, policyHash, status: "complete", requestsDispatched: 0,
    receivedAt: observedAt, requestId: oddsBatchId, slot: observedAt, date, contractVersion: ODDS_CONTRACT_VERSION,
    reasons: [], missingCoverage: [], pages: [], fixtures: [], catalog: [] };
  await insertRows(tx, "OddsImportBatch", [{ id: oddsBatchId, accountId, kind: "prices", scopeKey: oddsBatch.scopeKey, policyHash,
    status: "complete", requestsDispatched: 0, receivedAt: new Date(observedAt), integrity: emptySeal, body: json(oddsBatch) }]);
  for (const raw of fixtures) {
    const f = normalized(raw, nowMs), id = demoId("fixture", f.id), cycleId = demoId("cycle", f.id), revisionId = demoId("revision", f.id);
    const fixtureVersion = versions.get(id)!;
    const cutoff = getPublicationDeadline(f.kickoff!), closed = nowMs >= cutoff || f.status !== "scheduled";
    const voidReason = f.status === "postponed" ? "formal-postponement" : f.status === "canceled" ? "fixture-canceled"
      : f.status === "abandoned" ? "fixture-abandoned" : ["awarded", "walkover"].includes(f.status) ? "fixture-awarded" : null;
    const state = voidReason ? "void" : closed ? "closed" : "open";
    const lockAt = closed ? Math.min(observedAt, cutoff) : null;
    const originalCycle = originalCycles.get(id);
    if (!originalCycle) throw new Error("Synthetic observations require their original prediction cycle.");
    cycleRows.push({ id: cycleId, fixtureId: id, creationKey: demoHash(`cycle:${id}`), creationHash: demoHash(`cycle-create:${id}`), ordinal: 1,
      version: 1, scheduleVersion: 1, kickoffAt: new Date(f.kickoff!), cutoffAt: new Date(cutoff), openedAt: originalCycle.openedAt,
      state, currentSetId: revisionId, lockedSetId: closed ? revisionId : null, closedAt: dateAt(lockAt), lockedAt: dateAt(lockAt),
      voidedAt: voidReason ? dateAt(lockAt) : null, voidReason });
    const content = resultContent(f), { regulation } = content;
    const contentHash = evidenceFingerprint(content), resultId = demoHash(`result:${id}:${fixtureVersion}:${contentHash}`);
    const result = { ...content, id: resultId, fixtureId: id, fixtureVersion, previousId: null, observationId: demoHash(`observation:${id}:${contentHash}`),
      observedAt, providerUpdatedAt: observedAt, regulationVerifiedAt: regulation.verified ? observedAt : null };
    results.push({ id: resultId, fixtureId: id, fixtureVersion, observedAt: new Date(observedAt), status: f.status, regulationVerified: regulation.verified,
      regulationHome: regulation.home, regulationAway: regulation.away, contentHash, integrity: emptySeal, body: json(result) });
    states.push({ fixtureId: id, resultId, firstTrackedAt: new Date(observedAt), firstFinalAt: originalResults.get(id)?.firstFinalAt ?? (isPlayedFinalStatus(f.status) ? new Date(observedAt) : null),
      lastSyncAt: new Date(observedAt), lastAttemptAt: new Date(observedAt), nextCheckAt: null, failures: 0, delayReason: null });
    const rawOdds = demoFixtureOdds(f.id, observedAt, 8)!, bookmaker = rawOdds.bookmakers[0]!;
    oddsStates.push({ fixtureId: id, latestBatchId: oddsBatchId, policyHash, lastRetrievedAt: new Date(observedAt),
      lastProviderUpdatedAt: new Date(rawOdds.update), withdrawnAt: null, publicVersion: 1 });
    for (const family of Object.keys(marketSelections) as MarketFamily[]) {
      const item = markets.find((m) => m.setId === revisionId && m.family === family);
      if (!item?.available) continue;
      const mapping = launchOddsMapping.find((entry) => entry.family === family)!, bet = bookmaker.bets.find((entry) => entry.id === mapping.betId)!;
      const values = canonicalOddsValues(bet.values.map((value) => ({ label: value.value, odd: value.odd }))), valuesHash = oddsValuesHash(values);
      const snapshotId = demoHash(`odds:${id}:${bet.id}:${valuesHash}:${observedAt}`), retainUntil = Date.parse("2036-01-01T00:00:00Z");
      const oddsBody = { id: snapshotId, fixtureId: id, previousId: null, bookmakerId: bookmaker.id, bookmakerName: bookmaker.name,
        betId: bet.id, betName: bet.name, valuesHash, retrievedAt: observedAt, providerUpdatedAt: Date.parse(rawOdds.update), retainUntil, values };
      oddsSnapshots.push({ id: snapshotId, fixtureId: id, batchId: oddsBatchId, previousId: null, bookmakerExternalId: bookmaker.id,
        bookmakerName: bookmaker.name, betExternalId: bet.id, betName: bet.name, valuesHash, selectionCount: values.length, retrievedAt: new Date(observedAt),
        providerUpdatedAt: new Date(rawOdds.update), retainUntil: new Date(retainUntil), integrity: emptySeal, body: json(oddsBody) });
      const group = launchOddsGroup(mapping, { betId: bet.id, betName: bet.name, values }, bet.name);
      if (!group) throw new Error("Synthetic bookmaker market failed the production mapping.");
      for (const quote of group.selections) prices.push({ fixtureId: id, marketKey: family, selection: quote.selection, basis: "bookmaker", bookmakerExternalId: 8,
        line: group.line, priceDecimal: quote.price.text, displayHundredths: quote.displayHundredths, impliedProbability: quote.impliedProbability,
        overround: group.overround, method: group.method, mappingVersion: group.mappingVersion, snapshotId, basisJson: null,
        retrievedAt: new Date(observedAt), providerUpdatedAt: new Date(rawOdds.update), stale: false });
      if (!closed) continue;
      const outcome = settleMarketSelection(family, item.selection, { status: f.status as SettlementStatus,
        cycleEligibility: cycleEligibilityFor({ state, voidReason }),
        regulationScore: regulation.verified ? { verified: true, period: "regulation-including-stoppage-time", home: regulation.home!, away: regulation.away! } : null });
      const base = { fixtureId: id, cycleId, family, ruleVersion: MARKET_RULE_VERSION, lockedSetId: revisionId, selection: item.selection,
        source: item.source, selectedProbability: item.selectedProbability, resultId, resultUsable: true, status: outcome.status, reason: outcome.reason,
        cycleState: state, voidReason };
      const inputHash = evidenceFingerprint(base), prior = previous.find((p) => p.cycleId === cycleId && p.family === family)?.revision;
      if (prior?.inputHash === inputHash) continue;
      const batchId = demoHash(`settlement-batch:${id}:${fixtureVersion}:${contentHash}:${state}`), settlementId = demoHash(`settlement:${cycleId}:${family}:${inputHash}`);
      const body = { ...base, id: settlementId, batchId, previousId: prior?.id ?? null, inputHash, at: observedAt,
        correctedAt: null, kind: prior ? "transition" : "initial" };
      batches.push({ id: batchId, fixtureId: id, fixtureVersion, at: new Date(observedAt) });
      revisions.push({ id: settlementId, fixtureId: id, cycleId, family, batchId, previousId: prior?.id ?? null, resultId, lockedSetId: revisionId,
        inputHash, at: new Date(observedAt), integrity: emptySeal, body: json(body) });
      pointers.push({ fixtureId: id, cycleId, family, revisionId: settlementId });
    }
    const stats = demoFixtureStatistics(f.id, nowMs), events = demoFixtureEvents(f.id, nowMs);
    facts.push({ fixtureId: id, providerFixtureId: BigInt(f.id), venueExternalId: raw.fixture.venue.id === null ? null : BigInt(raw.fixture.venue.id),
      venueName: raw.fixture.venue.name, venueCity: raw.fixture.venue.city, referee: raw.fixture.referee, infoRetrievedAt: new Date(observedAt),
      events: json(events), eventsHash: evidenceFingerprint(events), eventsRetrievedAt: new Date(observedAt), statistics: json(stats),
      statisticsHash: evidenceFingerprint(stats), statisticsRetrievedAt: new Date(observedAt), updatedAt: new Date(observedAt) });
    if (f.status === "live" || isPlayedFinalStatus(f.status) || f.status === "abandoned") {
      const statistics = stats.flatMap((value) => { const entry = normalizeStatistics(value, { endpoint: "/fixtures/statistics", retrievedAt: utcInstantFromEpochMilliseconds(observedAt) }); return entry.valid ? [entry.data] : []; });
      const metrics = liveMatchMetrics.flatMap((metric) => {
        const pick = (teamId: number) => statistics.find((entry) => entry.team.id === teamId)?.statistics.find((entry) => entry.metric === metric && entry.supported)?.value;
        const home = pick(f.homeTeam.id), away = pick(f.awayTeam.id);
        return typeof home === "number" && typeof away === "number" ? [{ metric, unit: metric === "possession" || metric === "pass-accuracy" ? "percent" as const : "count" as const, home, away }] : [];
      });
      const normalEvents = events.flatMap((value) => { const event = normalizeEvent(value, { endpoint: "/fixtures/events", retrievedAt: utcInstantFromEpochMilliseconds(observedAt) }); return event.valid && event.data.type !== "unsupported" ? [event.data] : []; });
      const body = liveMatchSnapshotSchema.parse({ version: 1, fixtureId: id, cycleId, kickoffAt: f.kickoff, status: f.status, collectedAt: observedAt, staleAfterMs: 86_400_000,
        statistics: metrics.length ? { state: "available", retrievedAt: observedAt, providerUpdatedAt: observedAt, reason: null, items: metrics }
          : { state: "unavailable", retrievedAt: null, providerUpdatedAt: null, reason: "not-collected", items: [] },
        events: { state: "available", retrievedAt: observedAt, providerUpdatedAt: observedAt, reason: null,
          items: normalEvents.map((event, index) => ({ sequence: index + 1, elapsed: event.elapsed, extra: event.extra,
            team: event.teamId === f.homeTeam.id ? "home" : "away", type: event.type, detail: event.detail, player: event.player, assist: event.assist, comments: event.comments })) } });
      snapshots.push({ id: demoHash(`live:${id}`), fixtureId: id, cycleId, kickoffAt: new Date(f.kickoff!), homeTeamId: demoId("team", f.homeTeam.id),
        awayTeamId: demoId("team", f.awayTeam.id), receivedAt: new Date(observedAt), bodyJson: json(body), integrity: emptySeal,
        attemptedAt: new Date(observedAt), nextPollAt: new Date(nowMs + 60_000),
        firstFinalAt: originalSnapshots.get(id)?.firstFinalAt ?? (isPlayedFinalStatus(f.status) ? new Date(observedAt) : null), failures: 0 });
    }
  }
  await insertRows(tx, "PredictionCycle", cycleRows, ["state", "currentSetId", "lockedSetId", "closedAt", "lockedAt", "voidedAt", "voidReason"]);
  // The canonical fixture points to the same cycle used by every existing page reader.
  for (const slice of Array.from({ length: Math.ceil(fixtureIds.length / 100) }, (_, n) => fixtureIds.slice(n * 100, n * 100 + 100))) {
    const cases = slice.map((id) => Prisma.sql`WHEN ${id} THEN ${demoId("cycle", Number(fixtures.find((f) => demoId("fixture", f.fixture.id) === id)!.fixture.id))}`);
    await tx.$executeRaw(Prisma.sql`UPDATE FootballFixture SET activeCycleId=CASE id ${Prisma.join(cases, " ")} END WHERE id IN (${Prisma.join(slice)})`);
  }
  await insertRows(tx, "FixtureResult", results);
  await insertRows(tx, "FixtureResultState", states, ["resultId", "firstFinalAt", "lastSyncAt", "lastAttemptAt", "nextCheckAt", "failures", "delayReason"]);
  await insertRows(tx, "ProviderOddsSnapshot", oddsSnapshots);
  await insertRows(tx, "FixtureOddsState", oddsStates, ["latestBatchId", "lastRetrievedAt", "lastProviderUpdatedAt", "withdrawnAt"]);
  await insertRows(tx, "FixtureOddsPrice", prices, ["priceDecimal", "displayHundredths", "impliedProbability", "overround", "snapshotId", "retrievedAt", "providerUpdatedAt", "stale"]);
  await insertRows(tx, "FixtureFacts", facts, ["referee", "infoRetrievedAt", "events", "eventsHash", "eventsRetrievedAt", "statistics", "statisticsHash", "statisticsRetrievedAt", "updatedAt"]);
  await insertRows(tx, "LiveMatchSnapshot", snapshots, ["receivedAt", "bodyJson", "integrity", "attemptedAt", "nextPollAt", "firstFinalAt"]);
  await insertRows(tx, "SettlementBatch", [...new Map(batches.map((batch) => [String(batch.id), batch])).values()]);
  await insertRows(tx, "MarketSettlementRevision", revisions);
  await insertRows(tx, "MarketSettlement", pointers, ["revisionId"]);
}

const { pending, refreshed } = preparation;
const readyMarkerSchema = z.strictObject({ version: z.literal(readyMarkerVersion), date: z.string().regex(/^2026-\d{2}-\d{2}$/u),
  kind: z.enum(["future", "current", "past"]), generation: z.string().regex(/^[1-9]\d*$/u),
  readyAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(), oldestQuoteAt: z.number().int().nonnegative() });
const markerKey = (date: string) => demoHash(`readiness:${readyMarkerVersion}:${date}`);

/** Disposable, development-only preparation cache. It never supplies publication or
 * source authority: every ordinary production reader still validates its own rows. */
async function readyDemoDates(database: DatabaseRuntime, dates: readonly string[], nowMs: number): Promise<Set<string>> {
  if (!dates.length) return new Set();
  const expected = new Map(dates.map((date) => [markerKey(date), date]));
  const rows = await database.query((tx) => tx.$queryRaw<{ key: string; body: unknown; generations: unknown; createdAt: Date; expiresAt: Date; generation: bigint }[]>(Prisma.sql`
    SELECT r.\`key\`,r.body,r.generations,r.createdAt,r.expiresAt,t.generation FROM PublicResponseCache r
      JOIN PublicCacheTag t ON t.tag=CONCAT('date:',JSON_UNQUOTE(JSON_EXTRACT(r.body,'$.date')))
    WHERE r.\`key\` IN (${Prisma.join([...expected.keys()])}) AND r.createdAt<=${new Date(nowMs)} AND r.expiresAt>${new Date(nowMs)}`));
  const ready = new Set<string>();
  for (const row of rows) {
    let body: unknown, stamp: unknown;
    try { body = historyJson(row.body); stamp = historyJson(row.generations); } catch { continue; }
    const parsed = readyMarkerSchema.safeParse(body);
    if (!parsed.success) continue;
    const marker = parsed.data;
    const startAt = Date.parse(`${marker.date}T00:00:00+03:00`), finalAt = startAt + 27 * 3_600_000;
    const maximumExpiry = marker.kind === "future" ? Math.min(startAt, marker.oldestQuoteAt + 86_400_000)
      : marker.readyAt + (marker.kind === "current" ? 60_000 : 86_400_000);
    if (marker.date !== expected.get(row.key) || marker.readyAt !== row.createdAt.getTime() || marker.expiresAt !== row.expiresAt.getTime()
      || marker.expiresAt <= marker.readyAt || marker.expiresAt > maximumExpiry || marker.generation !== String(row.generation)
      || marker.kind === "future" && marker.readyAt >= startAt || marker.kind === "past" && marker.readyAt < finalAt
      || marker.kind === "current" && (marker.readyAt < startAt || marker.readyAt >= finalAt)
      || stamp === null || typeof stamp !== "object" || Array.isArray(stamp) || Object.keys(stamp).length !== 1
      || (stamp as Record<string, unknown>)[`date:${marker.date}`] !== marker.generation) continue;
    ready.add(marker.date);
  }
  return ready;
}

async function markDemoDateReady(database: DatabaseRuntime, date: string, nowMs: number) {
  const [proof] = await database.query((tx) => tx.$queryRaw<{ fixtures: bigint; forecasts: bigint; markets: bigint; states: bigint; prices: bigint; coherent: bigint; oldestQuote: Date | null; generation: bigint | null }[]>`
    SELECT COUNT(*) AS fixtures,
      SUM((SELECT COUNT(*) FROM PredictionSet s WHERE s.fixtureId=f.id)=1) AS forecasts,
      SUM((SELECT COUNT(*) FROM MarketPrediction m JOIN PredictionSet s ON s.id=m.setId WHERE s.fixtureId=f.id)=4) AS markets,
      SUM((SELECT COUNT(*) FROM FixtureResultState r WHERE r.fixtureId=f.id)=1) AS states,
      SUM((SELECT COUNT(*) FROM FixtureOddsPrice p WHERE p.fixtureId=f.id AND p.stale=FALSE
        AND p.marketKey IN ('match-result','double-chance','total-goals','both-teams-to-score'))=10) AS prices,
      SUM((SELECT COUNT(*) FROM FixtureOddsPrice p JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId WHERE p.fixtureId=f.id
        AND (p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt)))=0) AS coherent,
      MIN((SELECT MIN(p.retrievedAt) FROM FixtureOddsPrice p WHERE p.fixtureId=f.id)) AS oldestQuote,
      (SELECT generation FROM PublicCacheTag WHERE tag=${`date:${date}`}) AS generation
    FROM FootballFixture f WHERE f.eatDate=${dateValue(date)}`);
  if (!proof || ![proof.fixtures, proof.forecasts, proof.markets, proof.states, proof.prices, proof.coherent].every((count) => Number(count) === DEMO_MATCHES_PER_DAY)
    || !proof.oldestQuote || !proof.generation) return;
  const startAt = Date.parse(`${date}T00:00:00+03:00`), finalAt = startAt + 27 * 3_600_000;
  const kind = nowMs < startAt ? "future" as const : nowMs >= finalAt ? "past" as const : "current" as const;
  const expiresAt = kind === "future" ? Math.min(startAt, proof.oldestQuote.getTime() + 86_400_000) : nowMs + (kind === "current" ? 60_000 : 86_400_000);
  if (expiresAt <= nowMs) return;
  const body = { version: readyMarkerVersion, date, kind, generation: String(proof.generation), readyAt: nowMs, expiresAt, oldestQuoteAt: proof.oldestQuote.getTime() };
  await database.query((tx) => tx.$executeRaw`INSERT INTO PublicResponseCache(\`key\`,generations,body,createdAt,expiresAt)
    SELECT ${markerKey(date)},JSON_OBJECT(${`date:${date}`},${body.generation}),JSON_EXTRACT(${evidenceSerialize(body)},'$'),${new Date(nowMs)},${new Date(expiresAt)}
    FROM PublicCacheTag WHERE tag=${`date:${date}`} AND generation=${proof.generation}
    ON DUPLICATE KEY UPDATE generations=IF(createdAt<=VALUES(createdAt),VALUES(generations),generations),
      body=IF(createdAt<=VALUES(createdAt),VALUES(body),body),expiresAt=IF(createdAt<=VALUES(createdAt),VALUES(expiresAt),expiresAt),createdAt=GREATEST(createdAt,VALUES(createdAt))`);
}

async function refreshPrices(database: DatabaseRuntime, date: string, nowMs: number, includeStale = true) {
  // Synthetic prices are static. Their declared observation freshness is 24 hours;
  // historical dates retain their closing observation unless its provenance needs repair.
  // Refresh the immutable source and public projection together, as the live odds writer does.
  const observedMs = nowMs - 1000, observedAt = new Date(observedMs), staleBefore = new Date(observedMs - 86_400_000);
  const batchId = demoHash(`odds-batch:${date}:${observedMs}`), accountId = demoHash("odds-account"), policyHash = demoHash("odds-policy");
  const needed = await database.query(async (tx) => {
    const [row] = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM FixtureOddsPrice p
      JOIN FootballFixture f ON f.id=p.fixtureId JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId
      WHERE f.eatDate=${dateValue(date)} AND p.retrievedAt<=${observedAt}
        AND ((${includeStale} AND p.retrievedAt<${staleBefore}) OR p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt))`;
    return Number(row?.count ?? 0) > 0;
  });
  if (!needed) return;
  await demoWrite(database, async (tx) => {
    const [pending] = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM FixtureOddsPrice p
      JOIN FootballFixture f ON f.id=p.fixtureId JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId
      WHERE f.eatDate=${dateValue(date)} AND p.retrievedAt<=${observedAt}
        AND ((${includeStale} AND p.retrievedAt<${staleBefore}) OR p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt))`;
    if (!pending || Number(pending.count) === 0) return;
    const batch = { id: batchId, accountId, kind: "prices", scopeKey: `demo:${date}`, policyHash, status: "complete", requestsDispatched: 0,
      receivedAt: observedMs, requestId: batchId, slot: observedMs, date, contractVersion: ODDS_CONTRACT_VERSION,
      reasons: [], missingCoverage: [], pages: [], fixtures: [], catalog: [] };
    await insertRows(tx, "OddsImportBatch", [{ id: batchId, accountId, kind: "prices", scopeKey: batch.scopeKey, policyHash,
      status: "complete", requestsDispatched: 0, receivedAt: observedAt, integrity: emptySeal, body: json(batch) }]);
    await tx.$executeRaw`INSERT INTO ProviderOddsSnapshot
      (id,fixtureId,batchId,previousId,bookmakerExternalId,bookmakerName,betExternalId,betName,valuesHash,selectionCount,retrievedAt,providerUpdatedAt,retainUntil,integrity,body)
      SELECT incoming.id,incoming.fixtureId,${batchId},incoming.previousId,incoming.bookmakerExternalId,incoming.bookmakerName,
        incoming.betExternalId,incoming.betName,incoming.valuesHash,incoming.selectionCount,${observedAt},incoming.providerUpdatedAt,
        incoming.retainUntil,SHA2(CAST(incoming.body AS CHAR CHARACTER SET utf8mb4),256),incoming.body
      FROM (SELECT DISTINCT SHA2(CONCAT(s.fixtureId,':',s.betExternalId,':',${observedMs}),256) AS id,s.fixtureId,s.id AS previousId,
          s.bookmakerExternalId,s.bookmakerName,s.betExternalId,s.betName,s.valuesHash,s.selectionCount,s.retainUntil,
          LEAST(${observedAt},TIMESTAMPADD(MINUTE,-1,f.kickoff)) AS providerUpdatedAt,
          JSON_SET(s.body,'$.id',SHA2(CONCAT(s.fixtureId,':',s.betExternalId,':',${observedMs}),256),'$.previousId',s.id,
            '$.retrievedAt',${observedMs},'$.providerUpdatedAt',TIMESTAMPDIFF(MICROSECOND,'1970-01-01 00:00:00',LEAST(${observedAt},TIMESTAMPADD(MINUTE,-1,f.kickoff))) DIV 1000) AS body
        FROM FixtureOddsPrice p JOIN FootballFixture f ON f.id=p.fixtureId JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId
        WHERE f.eatDate=${dateValue(date)} AND p.retrievedAt<=${observedAt}
          AND ((${includeStale} AND p.retrievedAt<${staleBefore}) OR p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt))) incoming
      WHERE NOT EXISTS (SELECT 1 FROM ProviderOddsSnapshot existing WHERE existing.id=incoming.id)`;
    const changedPrices = await tx.$executeRaw`UPDATE FixtureOddsPrice p JOIN FootballFixture f ON f.id=p.fixtureId
      JOIN ProviderOddsSnapshot s ON s.id=SHA2(CONCAT(p.fixtureId,':',CASE p.marketKey WHEN 'match-result' THEN 1 WHEN 'double-chance' THEN 12 WHEN 'total-goals' THEN 5 WHEN 'both-teams-to-score' THEN 8 END,':',${observedMs}),256)
      SET p.snapshotId=s.id,p.retrievedAt=s.retrievedAt,p.providerUpdatedAt=s.providerUpdatedAt,p.stale=FALSE
      WHERE f.eatDate=${dateValue(date)} AND p.retrievedAt<=${observedAt} AND p.snapshotId<>s.id`;
    const changedStates = await tx.$executeRaw`UPDATE FixtureOddsState s JOIN FootballFixture f ON f.id=s.fixtureId
      SET s.latestBatchId=${batchId},s.lastRetrievedAt=${observedAt},s.lastProviderUpdatedAt=LEAST(${observedAt},TIMESTAMPADD(MINUTE,-1,f.kickoff))
      WHERE f.eatDate=${dateValue(date)} AND s.lastRetrievedAt<=${observedAt}`;
    if (changedPrices > 0 || changedStates > 0) await tx.$executeRaw`INSERT INTO PublicCacheTag (tag,generation) VALUES (${`date:${date}`},1) ON DUPLICATE KEY UPDATE generation=generation+1`;
  });
}

/** Idempotent rich materialization for the requested dates. Ordinary production services read the resulting tables. */
export async function ensureDemoDates(database: DatabaseRuntime, requested: readonly string[], nowMs = Date.now()): Promise<void> {
  await ensureCatalog(database, nowMs);
  const dates = [...new Set(requested)].sort();
  for (const date of dates) parseReportingDate(date);
  const durableReady = await readyDemoDates(database, dates.filter(inRange), nowMs);
  const queue = pending.get(database) ?? new Map<string, Promise<void>>(), stamps = refreshed.get(database) ?? new Map<string, number>();
  pending.set(database, queue); refreshed.set(database, stamps);
  for (const date of dates) {
    if (!inRange(date) || durableReady.has(date) || nowMs - (stamps.get(date) ?? 0) < 60_000) continue;
    let operation = queue.get(date);
    if (!operation) {
      operation = (async () => {
        const fixtures = demoFixturesForDate(date, nowMs), ids = fixtures.map((f) => demoId("fixture", f.fixture.id));
        // Count only these 560 sets via the market primary key. Prisma's relation
        // aggregate can group the entire market archive before applying the date filter.
        const published = await database.query((tx) => tx.$queryRaw<{ id: string; fixtureId: string; marketCount: bigint }[]>(Prisma.sql`
          SELECT s.id,s.fixtureId,(SELECT COUNT(*) FROM MarketPrediction m WHERE m.setId=s.id) AS marketCount
          FROM PredictionSet s WHERE s.fixtureId IN (${Prisma.join(ids)})`));
        const known = new Set(published.map((row) => row.fixtureId)), incomplete = published.filter((row) => Number(row.marketCount) !== 4);
        const repaired = new Set(incomplete.map((row) => row.fixtureId));
        if (incomplete.length) await repairMarketRows(database, incomplete.map((row) => row.id));
        const states = await database.query((tx) => tx.fixtureResultState.findMany({ where: { fixtureId: { in: ids } },
          select: { fixtureId: true, lastSyncAt: true, result: { select: { contentHash: true } } } }));
        const startAt = Date.parse(`${date}T00:00:00+03:00`), finalAt = startAt + 27 * 3_600_000;
        const complete = known.size === fixtures.length && states.length === fixtures.length;
        // Whole past days are immutable once every match has passed its longest possible playing window.
        // Future days need only a bulk quote clock refresh until the date starts; this state survives hot reloads.
        const stable = complete && repaired.size === 0 && (nowMs < startAt || nowMs >= finalAt && states.every((state) => state.lastSyncAt !== null && state.lastSyncAt.getTime() >= finalAt));
        if (stable) { await refreshPrices(database, date, nowMs, nowMs < startAt); await markDemoDateReady(database, date, nowMs); stamps.set(date, nowMs); return; }
        const cycles = await database.query((tx) => tx.predictionCycle.findMany({ where: { fixtureId: { in: ids } }, select: { fixtureId: true, state: true } }));
        const resultHashes = new Map(states.map((state) => [state.fixtureId, state.result?.contentHash]));
        const cycleStates = new Map(cycles.map((cycle) => [cycle.fixtureId, cycle.state]));
        const changed = fixtures.filter((raw) => {
          const id = demoId("fixture", raw.fixture.id), f = normalized(raw, nowMs);
          const closed = nowMs >= getPublicationDeadline(f.kickoff!) || f.status !== "scheduled";
          return !known.has(id) || repaired.has(id) || resultHashes.get(id) !== evidenceFingerprint(resultContent(f)) || (cycleStates.get(id) === "open") === closed;
        });
        if (changed.length) {
          const stored = new Map((await database.query((tx) => tx.footballFixture.findMany({ where: { id: { in: ids } },
            select: { id: true, status: true, providerStatus: true, elapsedMinutes: true, regulationHome: true, regulationAway: true, retrievedAt: true } })))
            .map((fixture) => [fixture.id, fixture]));
          const canonicalChanges = fixtures.filter((raw) => {
            const next = normalized(raw, nowMs), current = stored.get(demoId("fixture", raw.fixture.id));
            if (current && current.retrievedAt.getTime() > nowMs - 1000) return false;
            return !current || current.status !== next.status || current.providerStatus !== next.providerStatus
              || current.elapsedMinutes !== next.elapsedMinutes || current.regulationHome !== (next.regulationScore?.verified ? next.regulationScore.home : null)
              || current.regulationAway !== (next.regulationScore?.verified ? next.regulationScore.away : null);
          });
          if (canonicalChanges.length) await seedFixtureDay(database, date, nowMs, true, canonicalChanges);
        }
        // Short deterministic batches bound the demo mutex hold and allow interactive
        // live observations to interleave with a cold historical range import.
        for (let offset = 0; offset < changed.length; offset += 20) {
          const batch = changed.slice(offset, offset + 20);
          await demoWrite(database, async (tx) => { await seedForecasts(tx, batch.filter((f) => !known.has(demoId("fixture", f.fixture.id))), nowMs); await seedObservations(tx, batch, nowMs); });
        }
        await refreshPrices(database, date, nowMs);
        await markDemoDateReady(database, date, nowMs);
        stamps.set(date, nowMs);
      })().finally(() => queue.delete(date));
      queue.set(date, operation);
    }
    await operation;
  }
}

export async function ensureDemoFixture(database: DatabaseRuntime, id: string, nowMs = Date.now()) {
  await ensureCatalog(database, nowMs);
  const fixture = await database.query((tx) => tx.footballFixture.findUnique({ where: { id }, select: { eatDate: true } }));
  if (fixture?.eatDate) await ensureDemoDates(database, [fixture.eatDate.toISOString().slice(0, 10)], nowMs);
}

export async function seedDemoDatabase(database: DatabaseRuntime, options: Readonly<{ now?: number; enrich?: "current" | "default" | "all" | false;
  onProgress?: (message: string) => void }> = {}) {
  const nowMs = options.now ?? Date.now(), dates = days();
  await ensureCatalog(database, nowMs);
  const expected = dates.length * DEMO_MATCHES_PER_DAY;
  // A matching total can conceal a missing day balanced by duplicate/stray rows
  // elsewhere. Resume against each reporting date rather than only the grand total.
  const completed = new Set((await database.query((tx) => tx.footballFixture.groupBy({ by: ["eatDate"],
    where: { provider: "api-football", externalId: { gte: 900_000_000n, lt: 901_000_000n } }, _count: { _all: true } })))
    .filter((row) => row._count._all === DEMO_MATCHES_PER_DAY && row.eatDate).map((row) => row.eatDate!.toISOString().slice(0, 10)));
  if (dates.some((date) => !completed.has(date))) {
    for (const [index, date] of dates.entries()) {
      if (!completed.has(date)) await seedFixtureDay(database, date, nowMs);
      if (index % 25 === 0 || index === dates.length - 1) options.onProgress?.(`Demo schedule: ${index + 1}/${dates.length} days (${(index + 1) * DEMO_MATCHES_PER_DAY} matches).`);
    }
  }
  // Refresh estimates after the large first import; otherwise a new MySQL instance may
  // retain one-row catalog estimates and choose full fixture scans for ordinary date reads.
  await database.query((tx) => tx.$queryRaw`ANALYZE TABLE FootballTeam,FootballCompetition,FootballCompetitionProvider,FootballSeason,FootballFixture,PredictionCycle,PredictionSet,MarketPrediction`);
  if (options.enrich !== false) {
    const today = getReportingDate(utcInstantFromEpochMilliseconds(nowMs));
    const offsets = options.enrich === "current" ? [-1, 0, 1]
      : [...Array.from({ length: 31 }, (_, n) => n), ...Array.from({ length: 29 }, (_, n) => -n - 1)];
    const wanted = options.enrich === "all" ? dates : offsets.map((n) => addReportingDays(today, n)).filter(inRange);
    await ensureDemoSourcePairs(database, [], nowMs);
    for (const date of wanted) {
      await ensureDemoDates(database, [date], nowMs);
      await ensureDemoPublicationQuotes(database, [date], nowMs);
      if (date <= today) await ensureDemoSourcePairs(database, [date], nowMs);
      options.onProgress?.(`Demo match details ready: ${date}.`);
    }
    const slipDates = wanted.filter((date) => date <= today);
    if (slipDates.length) {
      const { ensureDemoSlipDates } = await import("./slips-seed.ts");
      for (const date of slipDates) {
        await ensureDemoSlipDates(database, [date], nowMs);
        options.onProgress?.(`Demo published and saved slips ready: ${date}.`);
      }
    }
  }
  await seedDemoWorkspace(database);
  await database.query((tx) => tx.$queryRaw`ANALYZE TABLE PredictionCycle,PredictionSchedule,PredictionSet,MarketPrediction,ModelVersion,FixtureResultState,FixtureResult,MarketSettlement,MarketSettlementRevision,FixtureOddsState,FixtureOddsPrice,PredictionQuote,ProviderOddsSnapshot,OddsImportBatch`);
  if (options.enrich !== false) await database.query((tx) => tx.$queryRaw`ANALYZE TABLE DevelopmentDemoSourcePair`);
  if (options.enrich !== false && options.enrich !== "current") {
    // Ordinary report readers retain one preparation clock. Advancing it after the
    // first aggregate would update live observations and invalidate its cache fill.
    const warmAsOf = utcInstantFromEpochMilliseconds(Date.now()), warmClock = { now: () => warmAsOf };
    options.onProgress?.("Preparing the validated default demo performance snapshot.");
    const { readPublicPerformance } = await import("../performance/public-performance.ts");
    const performance = await readPublicPerformance(new URLSearchParams(), warmClock);
    if (performance.policy.state !== "verified" || performance.policy.publicClaimAuthorized
      || inRange(getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))) && performance.cohort.fixtureCount < DEMO_MATCHES_PER_DAY) {
      throw new Error("The validated default demo performance snapshot is not ready.");
    }
    options.onProgress?.("Demo default performance ready.");
    options.onProgress?.("Preparing the validated default owner source comparison.");
    const { createSourceComparisonService } = await import("../comparison/source-comparison-service.ts");
    const comparison = await createSourceComparisonService({ database,
      competitionIds: demoFootballCatalog.leagues.map((league) => league.id), clock: warmClock }).read(new URLSearchParams());
    if (comparison.fixtureCount !== performance.cohort.fixtureCount
      || (comparison.diagnostic?.replayedFixtures ?? 0) !== comparison.orders.none) {
      throw new Error("The validated default owner source comparison is not ready.");
    }
    options.onProgress?.("Demo default owner source comparison ready.");
    options.onProgress?.("Preparing the validated default match summaries.");
    const { warmDemoFeedSummaries } = await import("./feed-summary.ts");
    await warmDemoFeedSummaries(warmClock, demoFootballCatalog.leagues.map((league) => league.id));
    options.onProgress?.("Demo default match summaries ready.");
  }
  return { dates: dates.length, matchesPerDay: DEMO_MATCHES_PER_DAY, fixtures: expected, leagues: demoFootballCatalog.leagues.length, teams: demoFootballCatalog.teams.length };
}

export async function verifyDemoDatabase(database: DatabaseRuntime) {
  await assertDemoDatabase(database);
  const expectedDates = days();
  const counts = await database.query((tx) => tx.$queryRaw<{ day: Date | null; matches: bigint }[]>`SELECT eatDate AS day, COUNT(*) AS matches
    FROM FootballFixture WHERE provider='api-football' AND externalId>=900000000 AND externalId<901000000 GROUP BY eatDate ORDER BY eatDate`);
  if (counts.length !== expectedDates.length || counts.some((entry, index) => entry.day?.toISOString().slice(0, 10) !== expectedDates[index]
    || Number(entry.matches) !== DEMO_MATCHES_PER_DAY)) throw new Error("Demo daily fixture coverage is incomplete.");
  return { days: counts.length, fixtures: counts.reduce((total, row) => total + Number(row.matches), 0), minimumPerDay: Math.min(...counts.map((row) => Number(row.matches))) };
}
