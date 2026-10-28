import "server-only";

import { calendarRules } from "../../domain/calendar.ts";
import { performanceRules } from "../../domain/performance.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { publicFixtureCohortScope } from "../matches/feed-read.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { cycleFromRows, revisionFromRows, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import { settlementRevisionFromRow, projectSettlementCycle } from "../settlement/settlement-read.ts";
import { modelVersionFromRow } from "../predictor/predictor-mysql-store.ts";
import type { MarketFamily } from "../../domain/markets.ts";
import type { PerformanceQuery } from "./performance-query.ts";
import { readPerformanceQuotes, type PerformanceQuotePolicy } from "./performance-quotes.ts";

type Tx = Prisma.TransactionClient;
type PerformanceReadBudget = { remainingBytes: number; overflow?: () => never };
class PerformanceBatchBudgetError extends Error {}

async function performanceFixtureIds(tx: Tx, query: PerformanceQuery, competitionIds: readonly number[]) {
  const scope = publicFixtureCohortScope(query.range, competitionIds);
  const selected = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id FROM FootballFixture f
    JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
    LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id WHERE ${scope}
    ORDER BY f.kickoff,f.id LIMIT ${performanceRules.maximumCohortFixtures + 1}`);
  if (selected.length > performanceRules.maximumCohortFixtures) throw new MatchFeedError("unavailable");
  return selected.map((v) => v.id);
}

/** Stream the complete cohort inside the caller's repeatable-read transaction. Each
 * decoded batch stays within the existing payload cap; dense batches split before
 * their JSON is fetched, so a large period never accumulates raw candidate bodies. */
export async function* readPerformanceBatches(tx: Tx, query: PerformanceQuery, competitionIds: readonly number[],
  quotePolicy: PerformanceQuotePolicy | null = null): AsyncGenerator<PerformanceSnapshot> {
  const ids = await performanceFixtureIds(tx, query, competitionIds);
  // Reuse a size proven safe for this snapshot. Repeating an oversized preflight
  // for every outer batch would repeatedly serialize large immutable JSON bodies
  // in MySQL before discarding the same metadata and splitting them again.
  let preferredBatchSize: number = performanceRules.maximumFixtures;
  async function* bounded(batchIds: string[], includeHistorical: boolean): AsyncGenerator<PerformanceSnapshot> {
    try {
      yield await readPerformanceBatch(tx, query, batchIds, { remainingBytes: performanceRules.maximumStoredBytes,
        overflow: () => { throw new PerformanceBatchBudgetError(); } }, includeHistorical, quotePolicy);
    } catch (error) {
      if (!(error instanceof PerformanceBatchBudgetError)) throw error;
      if (batchIds.length <= 1) throw new MatchFeedError("unavailable");
      const middle = Math.ceil(batchIds.length / 2);
      preferredBatchSize = Math.min(preferredBatchSize, middle);
      yield* bounded(batchIds.slice(0, middle), includeHistorical);
      yield* bounded(batchIds.slice(middle), false);
    }
  }
  for (let offset = 0; offset < Math.max(1, ids.length);) {
    const batch = ids.slice(offset, offset + preferredBatchSize);
    yield* bounded(batch, offset === 0);
    offset += Math.max(1, batch.length);
  }
}

/** Compatibility snapshot for bounded isolated consumers. Public reporting streams batches. */
export async function readPerformanceSnapshot(tx: Tx, query: PerformanceQuery, competitionIds: readonly number[], quotePolicy: PerformanceQuotePolicy | null = null) {
  const ids = await performanceFixtureIds(tx, query, competitionIds);
  const budget = { remainingBytes: performanceRules.maximumStoredBytes };
  const snapshot = await readPerformanceBatch(tx, query, ids.slice(0, performanceRules.maximumFixtures), budget, true, quotePolicy);
  for (let offset = performanceRules.maximumFixtures; offset < ids.length; offset += performanceRules.maximumFixtures) {
    const next = await readPerformanceBatch(tx, query, ids.slice(offset, offset + performanceRules.maximumFixtures), budget, false, quotePolicy);
    snapshot.records.push(...next.records);
    snapshot.settlements.push(...next.settlements);
    for (const [id, model] of next.models) snapshot.models.set(id, model);
    for (const [key, price] of next.quotes) snapshot.quotes.set(key, price);
    for (const key of ["total", "failed", "pending", "failedFixtures", "delayedRefreshes", "delayedFixtures"] as const)
      snapshot.operations[key] += next.operations[key];
  }
  return snapshot;
}

/** All rows are validated in their bounded batch before entering aggregate state. */
async function readPerformanceBatch(tx: Tx, query: PerformanceQuery, ids: string[], budget: PerformanceReadBudget, includeHistorical: boolean,
  quotePolicy: PerformanceQuotePolicy | null) {
  const fixtures = await tx.footballFixture.findMany({ where: { id: { in: ids } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      season: { select: { competitionId: true, competition: { select: { name: true, country: true } } } },
      lifecycleState: { select: { issue: true } }, resultState: { select: { resultId: true } } },
    orderBy: [{ kickoff: "asc" }, { id: "asc" }] });
  if (fixtures.length !== ids.length) throw new MatchFeedError("unavailable");
  const cycleIds = fixtures.flatMap((f) => f.activeCycleId ? [f.activeCycleId] : []);
  const cycles = await tx.predictionCycle.findMany({ where: { id: { in: cycleIds } } });
  const schedules = cycles.length ? await tx.predictionSchedule.findMany({ where: { OR: cycles.map((c) => ({ cycleId: c.id, version: c.scheduleVersion })) } }) : [];
  const scheduleMap = new Map(schedules.map((s) => [`${s.cycleId}:${s.version}`, s]));
  const cycleMap = new Map(cycles.map((c) => [c.id, cycleFromRows(c, scheduleMap.get(`${c.id}:${c.scheduleVersion}`) ?? null)]));
  if (cycleMap.size !== cycleIds.length) throw new MatchFeedError("unavailable");
  const locks = cycles.flatMap((c) => c.lockedSetId ? [c.lockedSetId] : []);
  // Resolve only small relational identities first. Every payload, including the
  // final quote sidecars, must fit before any JSON body is fetched or validated.
  // Otherwise a late overflow would discard already decoded, sealed revisions.
  const setMetadata = locks.length ? await tx.predictionSet.findMany({ where: { id: { in: locks } },
    select: { id: true, modelVersionId: true } }) : [];
  if (setMetadata.length !== locks.length) throw new MatchFeedError("unavailable");
  const modelIds = [...new Set(setMetadata.flatMap((row) => row.modelVersionId ? [row.modelVersionId] : []))];
  const resultIds = fixtures.flatMap((f) => f.resultState?.resultId ? [f.resultState.resultId] : []);
  const quotedLocks = quotePolicy ? cycles.flatMap((cycle) => cycle.state === "closed" && cycle.lockedSetId ? [cycle.lockedSetId] : []) : [];
  async function preflightJsonRows(from: Prisma.Sql, payload: Prisma.Sql, seal: Prisma.Sql, limit: number) {
    const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT COALESCE(SUM(OCTET_LENGTH(CAST(${payload} AS CHAR))),0) AS bytes, COUNT(*) AS total ${from}`);
    const bytes = Number(size?.bytes), total = Number(size?.total);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(total) || total < 0 || total > limit) throw new MatchFeedError("unavailable");
    if (bytes > budget.remainingBytes) {
      if (budget.overflow) budget.overflow();
      throw new MatchFeedError("unavailable");
    }
    budget.remainingBytes -= bytes;
    return { bytes, async load() {
      const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*, ${seal} AS validIntegrity ${from}`);
      if (rows.length !== total) throw new MatchFeedError("unavailable");
      return rows;
    } };
  }
  const setPlan = locks.length ? await preflightJsonRows(Prisma.sql`FROM PredictionSet r WHERE r.id IN (${Prisma.join(locks)})`, Prisma.sql`r.candidateJson`,
    Prisma.sql`r.integrity=SHA2(CONCAT(r.id,':',r.requestHash,':',CAST(r.candidateJson AS CHAR)),256)`, locks.length) : null;
  const marketPlan = locks.length ? await preflightJsonRows(Prisma.sql`FROM MarketPrediction r WHERE r.setId IN (${Prisma.join(locks)})`, Prisma.sql`r.payloadJson`,
    Prisma.sql`r.integrity=SHA2(CAST(r.payloadJson AS CHAR),256)`, locks.length * 4) : null;
  const resultPlan = resultIds.length ? await preflightJsonRows(Prisma.sql`FROM FixtureResult r WHERE r.id IN (${Prisma.join(resultIds)})`, Prisma.sql`r.body`,
    Prisma.sql`r.integrity=SHA2(CAST(r.body AS CHAR),256)`, resultIds.length) : null;
  const settlementPlan = cycleIds.length ? await preflightJsonRows(Prisma.sql`FROM MarketSettlementRevision r JOIN MarketSettlement p ON p.revisionId=r.id
    AND p.cycleId=r.cycleId AND p.family=r.family WHERE p.cycleId IN (${Prisma.join(cycleIds)})`, Prisma.sql`r.body`,
    Prisma.sql`r.integrity=SHA2(CAST(r.body AS CHAR),256)`, cycleIds.length * 4) : null;
  const modelPlan = modelIds.length ? await preflightJsonRows(Prisma.sql`FROM ModelVersion r WHERE r.id IN (${Prisma.join(modelIds)})`, Prisma.sql`r.configurationJson`,
    Prisma.sql`r.integrity=SHA2(CONCAT(r.id,':',CAST(r.configurationJson AS CHAR)),256)`, modelIds.length) : null;
  const quotePlan = quotedLocks.length ? await preflightJsonRows(Prisma.sql`FROM PredictionQuote r WHERE r.revisionId IN (${Prisma.join(quotedLocks)})`, Prisma.sql`r.body`,
    Prisma.sql`r.integrity=SHA2(CAST(r.body AS CHAR),256)`, quotedLocks.length * 4) : null;

  const setRows = setPlan ? await setPlan.load() : [];
  const marketRows = marketPlan ? await marketPlan.load() : [];
  const markets = new Map<string, HistoryRow[]>();
  for (const m of marketRows) { const id = String(m.setId); markets.set(id, [...(markets.get(id) ?? []), m]); }
  const revisions = new Map(setRows.map((r) => [String(r.id), revisionFromRows(r, markets.get(String(r.id)) ?? [])]));
  if (revisions.size !== locks.length) throw new MatchFeedError("unavailable");
  const resultRows = resultPlan ? await resultPlan.load() : [];
  const results = new Map(resultRows.map((r) => [String(r.id), fixtureResultFromRow(r)]));
  if (results.size !== resultIds.length) throw new MatchFeedError("unavailable");
  const settlementRows = settlementPlan ? await settlementPlan.load() : [];
  const settlements = settlementRows.map(settlementRevisionFromRow);
  const settlementMap = new Map<string, Map<MarketFamily, typeof settlements[number]>>();
  for (const revision of settlements) {
    const group = settlementMap.get(revision.cycleId) ?? new Map();
    group.set(revision.family, revision); settlementMap.set(revision.cycleId, group);
  }
  const modelRows = modelPlan ? await modelPlan.load() : [];
  const models = new Map(modelRows.map((r) => [String(r.id), modelVersionFromRow(r)]));
  if (models.size !== modelIds.length) throw new MatchFeedError("unavailable");
  const records = fixtures.map((fixture) => {
    const cycle = fixture.activeCycleId ? cycleMap.get(fixture.activeCycleId)! : null;
    const revision = cycle?.lockedSetId ? revisions.get(cycle.lockedSetId)! : null;
    const result = fixture.resultState?.resultId ? results.get(fixture.resultState.resultId)! : null;
    if (result && result.fixtureId !== fixture.id) throw new MatchFeedError("unavailable");
    const previous = cycle ? settlementMap.get(cycle.id) ?? new Map() : new Map();
    return { fixture, cycle, revision, result, projection: cycle ? projectSettlementCycle(fixture, result, fixture.lifecycleState?.issue ?? null, cycle, revision, previous) : null };
  });
  const quotes = new Map(quotePolicy ? await readPerformanceQuotes(tx, records.flatMap(({ fixture, cycle, revision }) =>
    cycle?.state === "closed" && revision ? [{ fixtureId: fixture.id, cycleId: cycle.id, revisionId: revision.id, openedAt: cycle.openedAt,
      publishedAt: revision.publishedAt, cutoffAt: cycle.cutoffAt, kickoffAt: cycle.kickoffAt }] : []), quotePolicy,
    // The independent quote reader retains its own count, seal and authority
    // checks against the exact bytes already reserved in this read snapshot.
    { remainingBytes: quotePlan?.bytes ?? 0 }) : []);
  const delta = calendarRules.cutoffSecondsBeforeKickoff * 1000;
  const historical = includeHistorical ? await tx.$queryRaw<{ voidReason: string }[]>(Prisma.sql`SELECT c.voidReason FROM PredictionCycle c
    JOIN FootballFixture f ON f.id=c.fixtureId WHERE c.state='void'
    AND c.cutoffAt>=${new Date(query.range.window.startInclusive - delta)} AND c.cutoffAt<${new Date(query.range.window.endExclusive - delta)}
    AND c.kickoffAt>=${new Date(query.range.window.startInclusive)} AND c.kickoffAt<${new Date(query.range.window.endExclusive)}
    AND f.provider='api-football' AND (f.activeCycleId IS NULL OR f.activeCycleId<>c.id)
    LIMIT ${performanceRules.maximumCohortFixtures + 1}`) : [];
  if (historical.length > performanceRules.maximumCohortFixtures) throw new MatchFeedError("unavailable");
  const firstRun = BigInt(query.range.startDate.replaceAll("-", "")), lastRun = BigInt(query.range.endDate.replaceAll("-", ""));
  const jobs = ids.length ? await tx.$queryRaw<{ fixtureId: string; state: string }[]>(Prisma.sql`SELECT rf.fixtureId,j.state FROM DailyRun d
    JOIN RunFixture rf ON rf.runId=d.id JOIN DurableJob j ON j.id=rf.jobId
    WHERE rf.fixtureId IN (${Prisma.join(ids)}) AND d.sequence>=${firstRun} AND d.sequence<=${lastRun}
    LIMIT ${performanceRules.maximumFixtures * performanceRules.maximumDays + 1}`) : [];
  const delayed = ids.length ? await tx.$queryRaw<{ fixtureId: string }[]>(Prisma.sql`SELECT r.fixtureId FROM DailyRun d JOIN PredictionRefreshResult r ON r.runId=d.id
    WHERE r.fixtureId IN (${Prisma.join(ids)}) AND d.sequence>=${firstRun} AND d.sequence<=${lastRun} AND r.outcome='retained-previous'
    LIMIT ${performanceRules.maximumFixtures * performanceRules.maximumDays + 1}`) : [];
  if (Math.max(jobs.length, delayed.length) > performanceRules.maximumFixtures * performanceRules.maximumDays) throw new MatchFeedError("unavailable");
  const failed = jobs.filter((j) => ["failed", "expired"].includes(j.state));
  const operations = { basis: "refresh-jobs-for-current-cohort-fixtures-across-runs" as const, total: jobs.length, failed: failed.length,
    pending: jobs.filter((j) => ["pending", "running"].includes(j.state)).length,
    failedFixtures: new Set(failed.map((j) => j.fixtureId)).size, delayedRefreshes: delayed.length, delayedFixtures: new Set(delayed.map((j) => j.fixtureId)).size };
  return { records, models, settlements, quotes, historicalCycles: { basis: "void-cycle-original-kickoff-in-period-excluding-applicable-cycle" as const,
    void: historical.length, postponed: historical.filter((c) => c.voidReason === "formal-postponement").length }, operations };
}
export type PerformanceSnapshot = Awaited<ReturnType<typeof readPerformanceBatch>>;
