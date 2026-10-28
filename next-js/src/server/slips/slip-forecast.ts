import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { liveClockFromProvider } from "../../domain/match-card.ts";
import type { SlipMatchWatch } from "../../domain/slip-match-refresh.ts";
import { savedSlipCompletedStatuses, type SavedSlipResult } from "../../domain/saved-slips.ts";
import { slipBuilderRules, type BuiltSlip, type SlipSelection } from "../../domain/slip-builder.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { reconstructCutoff, revisionEligibleForLock } from "../predictions/cutoff-eligibility.ts";
import type { CutoffSchedule } from "../predictions/cutoff-contract.ts";
import { historyFail, type StoredCycle, type StoredRevision } from "../predictions/history-contract.ts";
import { cycleFromRows, historyTime, revisionFromRows, storedCycle, storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical, resultStatus, storedFixtureResult, type StoredFixtureResult } from "../results/result-read.ts";
import { cycleEligibilityFor, storedSettlementRevision } from "../settlement/settlement-read.ts";

type Tx = Prisma.TransactionClient;
export const slipForecastReadRules = Object.freeze({
  // Preserve independent hydration budgets when a custom slip contains more than eight matches.
  maximumSelections: slipBuilderRules.maximumDays * slipBuilderRules.maximumCandidates,
  batchSize: 100, prefetchThreshold: 8,
});
const fixtureSelect = { id: true, status: true, activeCycleId: true, kickoff: true, homeTeamId: true, awayTeamId: true,
  regulationHome: true, regulationAway: true, regulationVerifiedAt: true, regulationEvidenceRef: true,
  lifecycleState: { select: { issue: true } }, resultState: { select: { resultId: true } } } as const;
type Fixture = Prisma.FootballFixtureGetPayload<{ select: typeof fixtureSelect }>;

export function slipRevisionMatches(selection: SlipMatchWatch, revision: StoredRevision | null): revision is StoredRevision {
  const reference = selection.forecast, market = revision?.candidate.markets[selection.family];
  return revision !== null && revision.fixtureId === selection.fixtureId && market?.available === true &&
    (market.market.probabilities as Readonly<Record<string, number>>)[selection.selection] === selection.probability &&
    (!reference || reference.cycleId === revision.cycleId && reference.revisionId === revision.id && reference.publishedAt === revision.publishedAt);
}

/** Shared fixture locks block source mutation until commit without requiring canonical UPDATE grants. */
export async function bindSlipForecasts(tx: Tx, slip: BuiltSlip, at: number): Promise<BuiltSlip | null> {
  const instant = utcInstantFromEpochMilliseconds(at), ids = [...new Set(slip.selections.map((selection) => selection.fixtureId))].sort();
  if (!ids.length || ids.length !== slip.selections.length) return null;
  const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM FootballFixture
    WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`);
  if (locked.length !== ids.length) return null;
  const fixtures = new Map((await tx.footballFixture.findMany({ where: { id: { in: ids } }, select: fixtureSelect })).map((row) => [row.id, row]));
  const selections: SlipSelection[] = [];
  for (const selection of slip.selections) {
    const fixture = fixtures.get(selection.fixtureId);
    if (!fixture || fixture.status !== "scheduled" || fixture.lifecycleState?.issue || fixture.kickoff?.getTime() !== selection.kickoffAt ||
      fixture.homeTeamId !== selection.homeTeam.id || fixture.awayTeamId !== selection.awayTeam.id || !fixture.activeCycleId) return null;
    const cycle = await storedCycle(tx, fixture.activeCycleId);
    if (!cycle || cycle.fixtureId !== fixture.id || cycle.state !== "open" || cycle.kickoffAt !== selection.kickoffAt ||
      cycle.openedAt > instant || cycle.cutoffAt <= instant || !cycle.currentSetId) return null;
    const revision = await storedRevision(tx, cycle.currentSetId);
    if (!slipRevisionMatches(selection, revision) || revision.cycleId !== cycle.id || revision.publishedAt > instant) return null;
    selections.push({ ...selection, forecast: { cycleId: cycle.id, revisionId: revision.id, publishedAt: revision.publishedAt } });
  }
  return { ...slip, selections };
}

const emptyResult = (selection: SlipMatchWatch): SavedSlipResult => ({ fixtureId: selection.fixtureId,
  family: selection.family, selection: selection.selection,
  ...(selection.forecast ? { forecast: selection.forecast } : {}), completed: false, status: "unknown",
  regulationVerified: false, regulationHome: null, regulationAway: null });

type HistoricalResult = Readonly<{ result: StoredFixtureResult | null; terminalVoid: boolean; completed?: boolean }>;
/** Pure projection of already validated, sealed records. The saved choice never changes to the cutoff's later choice. */
export function projectSlipForecastResult(selection: SlipMatchWatch, input: Readonly<{
  fixture: Fixture; cycle: StoredCycle | null; revision: StoredRevision | null; schedules: readonly CutoffSchedule[];
  result: StoredFixtureResult | null; historical: HistoricalResult | null; asOf: number;
}>): SavedSlipResult {
  const base = emptyResult(selection), { fixture, cycle, revision, asOf } = input;
  if (!selection.forecast || !cycle || cycle.id !== selection.forecast.cycleId || cycle.fixtureId !== selection.fixtureId ||
    cycle.openedAt > asOf || !slipRevisionMatches(selection, revision) || revision.publishedAt > asOf) return base;
  if (cycle.state === "void" && cycle.voidedAt !== null && cycle.voidedAt <= asOf) {
    return { ...base, completed: true, cycleEligibility: cycleEligibilityFor(cycle) };
  }
  if (cycle.state === "open") {
    return fixture.activeCycleId === cycle.id && fixture.status === "scheduled" && !fixture.lifecycleState?.issue
      && fixture.kickoff?.getTime() === selection.kickoffAt && fixture.homeTeamId === selection.homeTeam.id
      && fixture.awayTeamId === selection.awayTeam.id
      ? resultProjection(base, "scheduled", null, false) : base;
  }
  if (cycle.state !== "closed" || cycle.closedAt === null || cycle.closedAt > asOf) return base;
  const cutoff = reconstructCutoff(cycle, input.schedules, utcInstantFromEpochMilliseconds(asOf), cycle.closedAt);
  if (!cycle.lockedSetId || !revisionEligibleForLock(revision, cycle, input.schedules, cutoff.effectiveCloseAt)) {
    return { ...base, completed: true, cycleEligibility: { eligible: false, reason: "cutoff-invalidated" } };
  }
  if (fixture.activeCycleId !== null && fixture.activeCycleId !== cycle.id) {
    if (input.historical?.terminalVoid) return { ...base, completed: true, cycleEligibility: { eligible: false, reason: "ineligible-cycle" } };
    const result = input.historical?.result;
    return result && result.observedAt <= asOf && isPlayedFinalStatus(result.status)
      ? resultProjection(base, result.status, result, true) : { ...base, completed: input.historical?.completed === true };
  }
  const status = resultStatus.parse(fixture.status), result = input.result;
  const coherent = result !== null && result.observedAt <= asOf && result.fixtureId === fixture.id &&
    fixtureResultMatchesCanonical(fixture, result, fixture.lifecycleState?.issue ?? null);
  return resultProjection(base, status, coherent ? result : null, savedSlipCompletedStatuses.includes(status));
}

function resultProjection(base: SavedSlipResult, status: SavedSlipResult["status"], result: StoredFixtureResult | null,
  completed: boolean): SavedSlipResult {
  const verified = isPlayedFinalStatus(status) && result?.regulation.verified === true;
  const live = status === "live" && result?.status === "live";
  const liveScore = live && result.reportedGoals.home !== null && result.reportedGoals.away !== null;
  return { ...base, status, completed, regulationVerified: verified,
    regulationHome: verified ? result!.regulation.home : null, regulationAway: verified ? result!.regulation.away : null,
    progress: { score: verified ? { home: result!.regulation.home!, away: result!.regulation.away! }
      : liveScore ? { home: result!.reportedGoals.home!, away: result!.reportedGoals.away! } : null,
    liveClock: live ? liveClockFromProvider(result!.providerStatus, result!.elapsedMinutes, result!.stoppageMinutes) : null } };
}

/** Resolve only the original cycle's final evidence when a later cycle has become active. */
async function historicalResult(tx: Tx, selection: SlipMatchWatch, asOf: number): Promise<HistoricalResult | null> {
  const reference = selection.forecast;
  if (!reference) return null;
  const row = await tx.marketSettlementRevision.findFirst({ where: { fixtureId: selection.fixtureId, cycleId: reference.cycleId,
    family: selection.family, at: { lte: new Date(asOf) } },
    orderBy: [{ at: "desc" }, { id: "desc" }], select: { id: true } });
  if (!row) return null;
  const settlement = await storedSettlementRevision(tx, row.id);
  if (settlement.fixtureId !== selection.fixtureId || settlement.cycleId !== reference.cycleId ||
    settlement.family !== selection.family || settlement.at > asOf || settlement.cycleState === "open") return null;
  if (settlement.status === "void") return { result: null, terminalVoid: true, completed: true };
  if ((settlement.status === "correct" || settlement.status === "incorrect") && settlement.resultUsable && settlement.resultId) {
    const result = await storedFixtureResult(tx, selection.fixtureId, settlement.resultId);
    return result.observedAt <= settlement.at ? { result, terminalVoid: false, completed: true } : null;
  }
  // A correction can invalidate a prior result. Keep its public history visible as pending,
  // but never move backwards to the prior winning/losing score for adjudication.
  const [anchor] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM MarketSettlementRevision
    WHERE fixtureId=${selection.fixtureId} AND cycleId=${reference.cycleId} AND family=${selection.family}
      AND at<=${new Date(settlement.at)} AND JSON_UNQUOTE(JSON_EXTRACT(body,'$.status')) IN ('correct','incorrect','void')
    ORDER BY at DESC, id DESC LIMIT 1`);
  if (!anchor) return null;
  const previous = await storedSettlementRevision(tx, anchor.id);
  const completed = previous.fixtureId === selection.fixtureId && previous.cycleId === reference.cycleId &&
    previous.family === selection.family && previous.at <= settlement.at && previous.cycleState !== "open" &&
    ["correct", "incorrect", "void"].includes(previous.status);
  return { result: null, terminalVoid: false, completed };
}

type ForecastCache = Readonly<{
  cycles: Map<string, StoredCycle | null>; revisions: Map<string, StoredRevision | null>; schedules: Map<string, CutoffSchedule[]>;
}>;
function* batches(values: readonly string[]) {
  for (let offset = 0; offset < values.length; offset += slipForecastReadRules.batchSize) yield values.slice(offset, offset + slipForecastReadRules.batchSize);
}
function scheduleProjection(row: HistoryRow): CutoffSchedule {
  if (typeof row.version !== "number") return historyFail("invalid-state");
  return { version: row.version, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt), observedAt: historyTime(row.observedAt),
    actualStartedAt: row.actualStartedAt === null ? null : historyTime(row.actualStartedAt) };
}
/** Keep archive reads bounded by batches rather than one database round trip per original leg. */
async function prefetchForecasts(tx: Tx, cycleIds: readonly string[], revisionIds: readonly string[], cache: ForecastCache) {
  for (const ids of batches(cycleIds)) {
    const requested = new Set(ids), rows = await tx.predictionCycle.findMany({ where: { id: { in: ids } } });
    const schedules = await tx.predictionSchedule.findMany({ where: { cycleId: { in: ids } }, orderBy: [{ cycleId: "asc" }, { version: "asc" }] });
    const byCycle = new Map<string, Map<number, HistoryRow>>();
    for (const row of schedules) {
      if (!requested.has(row.cycleId)) return historyFail("invalid-state");
      const versions = byCycle.get(row.cycleId) ?? new Map<number, HistoryRow>();
      if (versions.has(row.version)) return historyFail("invalid-state");
      versions.set(row.version, row); byCycle.set(row.cycleId, versions);
    }
    ids.forEach((id) => cache.cycles.set(id, null));
    const seen = new Set<string>();
    for (const row of rows) {
      if (!requested.has(row.id) || seen.has(row.id)) return historyFail("invalid-state");
      seen.add(row.id);
      const versions = byCycle.get(row.id), cycle = cycleFromRows(row, versions?.get(row.scheduleVersion) ?? null);
      cache.cycles.set(row.id, cycle);
      if (cycle.state === "closed") cache.schedules.set(row.id, [...(versions?.values() ?? [])].sort((left, right) =>
        Number(left.version) - Number(right.version)).map(scheduleProjection));
    }
  }
  for (const ids of batches(revisionIds)) {
    const requested = new Set(ids), rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
      integrity=SHA2(CONCAT(id, ':', requestHash, ':', CAST(candidateJson AS CHAR)),256) AS validIntegrity
      FROM PredictionSet WHERE id IN (${Prisma.join(ids)})`);
    const markets = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity=SHA2(CAST(payloadJson AS CHAR),256) AS validIntegrity
      FROM MarketPrediction WHERE setId IN (${Prisma.join(ids)})`);
    const byRevision = new Map<string, HistoryRow[]>();
    for (const row of markets) {
      if (typeof row.setId !== "string" || !requested.has(row.setId)) return historyFail("invalid-state");
      const values = byRevision.get(row.setId) ?? []; values.push(row); byRevision.set(row.setId, values);
    }
    ids.forEach((id) => cache.revisions.set(id, null));
    const seen = new Set<string>();
    for (const row of rows) {
      if (typeof row.id !== "string" || !requested.has(row.id) || seen.has(row.id)) return historyFail("invalid-state");
      seen.add(row.id); cache.revisions.set(row.id, revisionFromRows(row, byRevision.get(row.id) ?? []));
    }
  }
}

/** Batch current result reads; per-original-cycle caches prevent one query per repeated slip leg. */
export async function readSlipForecastResults(tx: Tx, selections: readonly SlipMatchWatch[], asOf: number): Promise<readonly SavedSlipResult[]> {
  utcInstantFromEpochMilliseconds(asOf);
  if (selections.length > slipForecastReadRules.maximumSelections) return historyFail("invalid-request");
  const fixtureIds = [...new Set(selections.map((selection) => selection.fixtureId))];
  if (!fixtureIds.length) return [];
  const fixtures = new Map((await tx.footballFixture.findMany({ where: { id: { in: fixtureIds } }, select: fixtureSelect })).map((row) => [row.id, row]));
  const resultIds = [...new Set([...fixtures.values()].flatMap((row) => row.resultState?.resultId ? [row.resultState.resultId] : []))];
  const resultRows = resultIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM FixtureResult WHERE id IN (${Prisma.join(resultIds)})`) : [];
  const results = new Map(resultRows.map((row) => { const result = fixtureResultFromRow(row); return [result.id, result]; }));
  const cycles = new Map<string, StoredCycle | null>(), revisions = new Map<string, StoredRevision | null>(), schedules = new Map<string, CutoffSchedule[]>();
  const references = selections.flatMap((selection) => selection.forecast ? [selection.forecast] : []);
  const cycleIds = [...new Set(references.map((reference) => reference.cycleId))], revisionIds = [...new Set(references.map((reference) => reference.revisionId))];
  if (Math.max(cycleIds.length, revisionIds.length) > slipForecastReadRules.prefetchThreshold) {
    await prefetchForecasts(tx, cycleIds, revisionIds, { cycles, revisions, schedules });
  }
  const history = new Map<string, HistoricalResult | null>(), projected: SavedSlipResult[] = [];
  for (const selection of selections) {
    const fixture = fixtures.get(selection.fixtureId), reference = selection.forecast;
    if (!fixture) { projected.push(emptyResult(selection)); continue; }
    const result = results.get(fixture.resultState?.resultId ?? "") ?? null;
    if (!reference) {
      const status = resultStatus.parse(fixture.status), coherent = result !== null && result.observedAt <= asOf && result.fixtureId === fixture.id &&
        fixtureResultMatchesCanonical(fixture, result, fixture.lifecycleState?.issue ?? null);
      projected.push(resultProjection(emptyResult(selection), status, coherent ? result : null, savedSlipCompletedStatuses.includes(status)));
      continue;
    }
    if (!cycles.has(reference.cycleId)) cycles.set(reference.cycleId, await storedCycle(tx, reference.cycleId));
    if (!revisions.has(reference.revisionId)) revisions.set(reference.revisionId, await storedRevision(tx, reference.revisionId));
    const cycle = cycles.get(reference.cycleId) ?? null;
    if (cycle?.state === "closed" && !schedules.has(cycle.id)) {
      schedules.set(cycle.id, (await tx.predictionSchedule.findMany({ where: { cycleId: cycle.id }, orderBy: { version: "asc" } })).map(scheduleProjection));
    }
    const key = `${reference.cycleId}:${selection.family}`;
    if (cycle?.state === "closed" && fixture.activeCycleId !== null && fixture.activeCycleId !== cycle.id && !history.has(key)) {
      history.set(key, await historicalResult(tx, selection, asOf));
    }
    projected.push(projectSlipForecastResult(selection, { fixture, cycle, revision: revisions.get(reference.revisionId) ?? null,
      schedules: schedules.get(reference.cycleId) ?? [], result, historical: history.get(key) ?? null, asOf }));
  }
  return projected;
}
