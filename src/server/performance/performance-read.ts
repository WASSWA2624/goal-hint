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

type Tx = Prisma.TransactionClient;
export async function readPerformanceSnapshot(tx: Tx, query: PerformanceQuery, competitionIds: readonly number[]) {
  const scope = publicFixtureCohortScope(query.range, competitionIds);
  const selected = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT f.id FROM FootballFixture f
    JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
    LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id WHERE ${scope}
    ORDER BY f.kickoff,f.id LIMIT ${performanceRules.maximumFixtures + 1}`);
  if (selected.length > performanceRules.maximumFixtures) throw new MatchFeedError("unavailable");
  const ids = selected.map((v) => v.id);
  const fixtures = await tx.footballFixture.findMany({ where: { id: { in: ids } },
    include: { season: { select: { competitionId: true } }, lifecycleState: { select: { issue: true } }, resultState: { select: { resultId: true } } },
    orderBy: [{ kickoff: "asc" }, { id: "asc" }] });
  if (fixtures.length !== ids.length) throw new MatchFeedError("unavailable");
  const cycleIds = fixtures.flatMap((f) => f.activeCycleId ? [f.activeCycleId] : []);
  const cycles = await tx.predictionCycle.findMany({ where: { id: { in: cycleIds } } });
  const schedules = cycles.length ? await tx.predictionSchedule.findMany({ where: { OR: cycles.map((c) => ({ cycleId: c.id, version: c.scheduleVersion })) } }) : [];
  const scheduleMap = new Map(schedules.map((s) => [`${s.cycleId}:${s.version}`, s]));
  const cycleMap = new Map(cycles.map((c) => [c.id, cycleFromRows(c, scheduleMap.get(`${c.id}:${c.scheduleVersion}`) ?? null)]));
  if (cycleMap.size !== cycleIds.length) throw new MatchFeedError("unavailable");
  const locks = cycles.flatMap((c) => c.lockedSetId ? [c.lockedSetId] : []);
  let remainingBytes: number = performanceRules.maximumStoredBytes;
  async function jsonRows(from: Prisma.Sql, payload: Prisma.Sql, seal: Prisma.Sql, limit: number) {
    const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT COALESCE(SUM(OCTET_LENGTH(CAST(${payload} AS CHAR))),0) AS bytes, COUNT(*) AS total ${from}`);
    const bytes = Number(size?.bytes), total = Number(size?.total);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > remainingBytes || !Number.isSafeInteger(total) || total > limit) throw new MatchFeedError("unavailable");
    remainingBytes -= bytes;
    return tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*, ${seal} AS validIntegrity ${from}`);
  }
  const setRows = locks.length ? await jsonRows(Prisma.sql`FROM PredictionSet r WHERE r.id IN (${Prisma.join(locks)})`, Prisma.sql`r.candidateJson`,
    Prisma.sql`r.integrity=SHA2(CONCAT(r.id,':',r.requestHash,':',CAST(r.candidateJson AS CHAR)),256)`, locks.length) : [];
  const marketRows = locks.length ? await jsonRows(Prisma.sql`FROM MarketPrediction r WHERE r.setId IN (${Prisma.join(locks)})`, Prisma.sql`r.payloadJson`,
    Prisma.sql`r.integrity=SHA2(CAST(r.payloadJson AS CHAR),256)`, locks.length * 4) : [];
  const markets = new Map<string, HistoryRow[]>();
  for (const m of marketRows) { const id = String(m.setId); markets.set(id, [...(markets.get(id) ?? []), m]); }
  const revisions = new Map(setRows.map((r) => [String(r.id), revisionFromRows(r, markets.get(String(r.id)) ?? [])]));
  if (revisions.size !== locks.length) throw new MatchFeedError("unavailable");
  const resultIds = fixtures.flatMap((f) => f.resultState?.resultId ? [f.resultState.resultId] : []);
  const resultRows = resultIds.length ? await jsonRows(Prisma.sql`FROM FixtureResult r WHERE r.id IN (${Prisma.join(resultIds)})`, Prisma.sql`r.body`,
    Prisma.sql`r.integrity=SHA2(CAST(r.body AS CHAR),256)`, resultIds.length) : [];
  const results = new Map(resultRows.map((r) => [String(r.id), fixtureResultFromRow(r)]));
  if (results.size !== resultIds.length) throw new MatchFeedError("unavailable");
  const settlementRows = cycleIds.length ? await jsonRows(Prisma.sql`FROM MarketSettlementRevision r JOIN MarketSettlement p ON p.revisionId=r.id
    AND p.cycleId=r.cycleId AND p.family=r.family WHERE p.cycleId IN (${Prisma.join(cycleIds)})`, Prisma.sql`r.body`,
    Prisma.sql`r.integrity=SHA2(CAST(r.body AS CHAR),256)`, cycleIds.length * 4) : [];
  const settlements = settlementRows.map(settlementRevisionFromRow);
  const settlementMap = new Map<string, Map<MarketFamily, typeof settlements[number]>>();
  for (const revision of settlements) {
    const group = settlementMap.get(revision.cycleId) ?? new Map();
    group.set(revision.family, revision); settlementMap.set(revision.cycleId, group);
  }
  const modelIds = [...new Set(setRows.flatMap((r) => r.modelVersionId ? [String(r.modelVersionId)] : []))];
  const modelRows = modelIds.length ? await jsonRows(Prisma.sql`FROM ModelVersion r WHERE r.id IN (${Prisma.join(modelIds)})`, Prisma.sql`r.configurationJson`,
    Prisma.sql`r.integrity=SHA2(CONCAT(r.id,':',CAST(r.configurationJson AS CHAR)),256)`, modelIds.length) : [];
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
  const delta = calendarRules.cutoffSecondsBeforeKickoff * 1000;
  const historical = await tx.$queryRaw<{ voidReason: string }[]>(Prisma.sql`SELECT c.voidReason FROM PredictionCycle c
    JOIN FootballFixture f ON f.id=c.fixtureId WHERE c.state='void'
    AND c.cutoffAt>=${new Date(query.range.window.startInclusive - delta)} AND c.cutoffAt<${new Date(query.range.window.endExclusive - delta)}
    AND c.kickoffAt>=${new Date(query.range.window.startInclusive)} AND c.kickoffAt<${new Date(query.range.window.endExclusive)}
    AND f.provider='api-football' AND (f.activeCycleId IS NULL OR f.activeCycleId<>c.id)
    LIMIT ${performanceRules.maximumFixtures + 1}`);
  if (historical.length > performanceRules.maximumFixtures) throw new MatchFeedError("unavailable");
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
  return { records, models, settlements, historicalCycles: { basis: "void-cycle-original-kickoff-in-period-excluding-applicable-cycle" as const,
    void: historical.length, postponed: historical.filter((c) => c.voidReason === "formal-postponement").length }, operations };
}
export type PerformanceSnapshot = Awaited<ReturnType<typeof readPerformanceSnapshot>>;
