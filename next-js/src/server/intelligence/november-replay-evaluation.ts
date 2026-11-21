import "server-only";

import { isPlayedFinalStatus, playedFinalFixtureStatuses, type SettlementStatus } from "../../domain/market-settlement.ts";
import { marketRules, marketSelections, validateMarketSnapshot, type MarketFamily } from "../../domain/markets.ts";
import { settleGoalSelection, type GoalMarketDefinition, type GoalSettlementContext } from "../../domain/score-distribution-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMarketMetricsAccumulator } from "../evaluation/evaluation-metrics.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, type StoredFixtureResult } from "../results/result-read.ts";
import type { IntelligenceProbabilities } from "./intelligence-contract.ts";
import type { auditNovemberReplay } from "./november-replay-audit.ts";

type Audit = Awaited<ReturnType<typeof auditNovemberReplay>>;
type ReplayResultOccurrence = Pick<Audit["occurrences"][number], "fixtureId" | "kickoffAt" | "teams" | "status">;
type ReplayResultRow = HistoryRow & { fixtureId: string; occurrenceKickoff: Date };
const resultKey = (fixtureId: string, kickoffAt: number) => `${fixtureId}:${kickoffAt}`;
export type NovemberReplayPrediction = Readonly<{ fixtureId: string; kickoffAt: number; probabilities: IntelligenceProbabilities | null;
  featured?: { definition: GoalMarketDefinition; selection: string; mode?: "standard" | "priced-fallback" | "forecast-only" } }>;
const families = Object.keys(marketSelections) as MarketFamily[];
const bands = [0, 0.2, 0.4, 0.6, 0.8, 1];

function reportMetrics(metrics: ReturnType<ReturnType<typeof createMarketMetricsAccumulator>["snapshot"]>) {
  if (metrics.logLoss === Infinity) return { ...metrics, logLoss: null, infiniteLogLoss: true };
  return metrics;
}

async function readReplayResultPage(database: Pick<DatabaseRuntime, "query">, page: readonly ReplayResultOccurrence[],
  asOf: number, allowNewlyFinished = false) {
  const identity = Prisma.join(page.map(({ fixtureId, kickoffAt, teams, status }) => Prisma.sql`(${fixtureId},${new Date(kickoffAt)},
    ${teams[0]},${teams[1]}${allowNewlyFinished ? Prisma.empty : Prisma.sql`,${status}`})`));
  const readAt = new Date(asOf);
  const rows = await database.query((tx) => tx.$queryRaw<ReplayResultRow[]>(Prisma.sql`SELECT r.*, f.kickoff AS occurrenceKickoff,
    r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
    FROM FootballFixture f JOIN FixtureResultState rs ON rs.fixtureId=f.id
    JOIN FixtureResult r ON r.id=rs.resultId AND r.fixtureId=f.id AND r.status=f.status
    LEFT JOIN FixtureLifecycleState life ON life.fixtureId=f.id
    LEFT JOIN PredictionChangeEvent changeEvent ON changeEvent.fixtureResultId=r.id
    LEFT JOIN FootballFixtureAudit resultAudit ON resultAudit.fixtureId=r.fixtureId AND resultAudit.dataVersion=r.fixtureVersion
    LEFT JOIN FootballImport resultImport ON resultImport.id=resultAudit.importId AND resultImport.provider='api-football'
    WHERE (f.id,f.kickoff,f.homeTeamId,f.awayTeamId${allowNewlyFinished ? Prisma.empty : Prisma.sql`,f.status`}) IN (${identity})
      AND f.status IN (${Prisma.join(playedFinalFixtureStatuses)}) AND life.issue IS NULL
      AND r.regulationVerified=TRUE AND r.observedAt>f.kickoff AND r.observedAt<=${readAt}
      AND COALESCE(changeEvent.at,resultImport.recordedAt)<=${readAt}`));
  return new Map(rows.map((row) => [resultKey(row.fixtureId, row.occurrenceKickoff.getTime()), row]));
}

type VerifiedReplayResult = StoredFixtureResult & { regulation: { home: number; away: number } };
function checkedReplayResult(row: HistoryRow, occurrence: ReplayResultOccurrence, asOf: number): VerifiedReplayResult | null {
  let result;
  try { result = fixtureResultFromRow(row); }
  catch { return null; }
  if (result.fixtureId !== occurrence.fixtureId || result.observedAt <= occurrence.kickoffAt || result.observedAt > asOf ||
    !isPlayedFinalStatus(result.status) || !result.regulation.verified || result.regulation.home === null || result.regulation.away === null) return null;
  return result as VerifiedReplayResult;
}

function resultContext(result: VerifiedReplayResult) {
  const half = result.halfTime;
  return { status: result.status, cycleEligibility: { eligible: true as const },
    regulationScore: { verified: true as const, period: marketRules.period, home: result.regulation.home, away: result.regulation.away },
    halfTimeScore: half ? { verified: half.verified, period: half.period, home: half.home, away: half.away } : null,
  } satisfies GoalSettlementContext;
}

/** Read checked terminal labels for exact occurrences after both comparison selections have been made. */
export async function readVerifiedReplayComparisonResults(database: Pick<DatabaseRuntime, "query">,
  occurrences: readonly ReplayResultOccurrence[], evaluatedAt: number) {
  const truth = new Map<string, GoalSettlementContext>();
  for (let offset = 0; offset < occurrences.length; offset += 100) {
    const page = occurrences.slice(offset, offset + 100);
    const rows = await readReplayResultPage(database, page, evaluatedAt, true);
    for (const occurrence of page) {
      const key = resultKey(occurrence.fixtureId, occurrence.kickoffAt), row = rows.get(key);
      const result = row && checkedReplayResult(row, occurrence, evaluatedAt);
      if (result) truth.set(key, resultContext(result));
    }
  }
  return truth;
}

/** Result references are joined to the exact audited occurrence only after decisions have been checkpointed. */
export async function evaluateNovemberReplay(database: Pick<DatabaseRuntime, "query">, audit: Audit,
  predictions: readonly NovemberReplayPrediction[]) {
  const qualified = new Map(predictions.map((value) => [`${value.fixtureId}:${value.kickoffAt}`, value]));
  const occurrences = audit.occurrences.filter((row) => isPlayedFinalStatus(row.status as SettlementStatus) && row.kickoffAt < audit.auditedAt);
  const counts = { finished: occurrences.length, verified: 0, readable: 0, unreadable: 0, featuredGrades: {} as Record<string, number>,
    featuredGradesByMode: {} as Record<string, Record<string, number>> };
  const metrics = families.map((family) => ({ family, allLocal: createMarketMetricsAccumulator(family, bands, 1.96),
    matchedLocal: createMarketMetricsAccumulator(family, bands, 1.96), matchedPrior: createMarketMetricsAccumulator(family, bands, 1.96) }));
  for (let offset = 0; offset < occurrences.length; offset += 100) {
    const page = occurrences.slice(offset, offset + 100);
    const results = await readReplayResultPage(database, page, audit.auditedAt);
    for (const item of page) {
      const row = results.get(resultKey(item.fixtureId, item.kickoffAt));
      if (!row) continue;
      const result = checkedReplayResult(row, item, audit.auditedAt);
      if (!result) { counts.unreadable++; continue; }
      counts.verified++;
      const prediction = qualified.get(`${item.fixtureId}:${item.kickoffAt}`);
      if (!prediction) continue;
      counts.readable++;
      const truth = resultContext(result);
      const { probabilities, featured } = prediction;
      if (featured) {
        const { status } = settleGoalSelection(featured.definition, featured.selection, truth);
        counts.featuredGrades[status] = (counts.featuredGrades[status] ?? 0) + 1;
        const mode = counts.featuredGradesByMode[featured.mode ?? "standard"] ??= {};
        mode[status] = (mode[status] ?? 0) + 1;
      }
      if (!probabilities) continue;
      const local = validateMarketSnapshot({
        "match-result": { source: "local-engine", period: marketRules.period, probabilities: probabilities["match-result"] },
        "total-goals": { source: "local-engine", period: marketRules.period, line: marketRules.totalGoalsLine, probabilities: probabilities["total-goals"] },
        "both-teams-to-score": { source: "local-engine", period: marketRules.period, probabilities: probabilities["both-teams-to-score"] },
      });
      const prior = item.sourceRevisionId && item.sourcePublishedAt !== null && item.sourcePublishedAt < item.effectiveCutoffAt
        ? await database.query((tx) => storedRevision(tx, item.sourceRevisionId!)).catch(() => null) : null;
      const eligiblePrior = prior && prior.fixtureId === item.fixtureId && prior.candidate.context.context.kickoffAt === item.kickoffAt ? prior : null;
      for (const { family, allLocal, matchedLocal, matchedPrior } of metrics) {
        const market = local.markets[family];
        if (!market.available) continue;
        allLocal.add([{ market: market.market, result: truth }]);
        const original = eligiblePrior?.candidate.markets[family];
        if (!original?.available || original.market.source === "api-football" && !item.markets.some((market) =>
          market.family === family && market.preCutoffProviderReceipt)) continue;
        matchedLocal.add([{ market: market.market, result: truth }]);
        matchedPrior.add([{ market: original.market, result: truth }]);
      }
    }
  }
  return { ...counts, coverage: counts.verified ? counts.readable / counts.verified : null,
    markets: Object.fromEntries(metrics.map(({ family, allLocal, matchedLocal, matchedPrior }) => [family,
      { local: reportMetrics(allLocal.snapshot()), matchedLocal: reportMetrics(matchedLocal.snapshot()), matchedPrior: reportMetrics(matchedPrior.snapshot()) }])) };
}

type FrozenPick = Readonly<{ definition: GoalMarketDefinition; selection: string; probability: number }>;
export type FrozenReplayPair = Readonly<{ fixtureId: string; kickoffAt: number; v1: FrozenPick | null; v2: FrozenPick | null }>;
type CalibrationObservation = Readonly<{ probability: number; won: boolean }>;
const calibrationFloors = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95] as const;
const minimumCalibrationSample = 30;

export function replayFeaturedCalibration(observations: readonly CalibrationObservation[]) {
  return calibrationFloors.map((from, index) => {
    const next = calibrationFloors[index + 1], to = next ?? 1;
    const picks = observations.filter(({ probability }) => probability >= from && (next === undefined ? probability <= to : probability < to));
    const n = picks.length, outrightWins = picks.filter(({ won }) => won).length;
    return { from, to, maximumInclusive: next === undefined, n, outrightWins, sufficientSample: n >= minimumCalibrationSample,
      meanModelProbability: n ? picks.reduce((sum, { probability }) => sum + probability, 0) / n : null,
      brier: n ? picks.reduce((sum, { probability, won }) => sum + (probability - Number(won)) ** 2, 0) / n : null };
  });
}

/** Grade frozen picks on the exact verified occurrence. Later final labels never enter selection inputs. */
export async function evaluateReplayFeaturedDelta(database: Pick<DatabaseRuntime, "query">, audit: Audit,
  predictions: readonly FrozenReplayPair[], evaluatedAt: number) {
  const pairs = new Map(predictions.map((pair) => [`${pair.fixtureId}:${pair.kickoffAt}`, pair]));
  const occurrences = audit.occurrences.filter(({ fixtureId, kickoffAt }) => pairs.has(`${fixtureId}:${kickoffAt}`));
  const counts = { comparable: pairs.size, resultAvailable: 0, matchedSettled: 0, newlyPriced: 0, newlySettled: 0 };
  const v1: CalibrationObservation[] = [], v2: CalibrationObservation[] = [];
  const matchedV1: CalibrationObservation[] = [], matchedV2: CalibrationObservation[] = [], newlyPricedV2: CalibrationObservation[] = [];
  for (let offset = 0; offset < occurrences.length; offset += 100) {
    const page = occurrences.slice(offset, offset + 100);
    const results = await readReplayResultPage(database, page, evaluatedAt, true);
    for (const item of page) {
      const pair = pairs.get(`${item.fixtureId}:${item.kickoffAt}`)!;
      if (!pair.v1 && pair.v2) counts.newlyPriced++;
      const row = results.get(resultKey(item.fixtureId, item.kickoffAt)), result = row && checkedReplayResult(row, item, evaluatedAt);
      if (!result) continue;
      counts.resultAvailable++;
      const truth = resultContext(result);
      const grade = (pick: FrozenPick | null) => {
        if (!pick) return null;
        const { status } = settleGoalSelection(pick.definition, pick.selection, truth);
        return status === "void" || status === "unavailable" || status === "pending" ? null :
          { probability: pick.probability, won: status === "correct" };
      };
      const first = grade(pair.v1), second = grade(pair.v2);
      if (first) v1.push(first);
      if (second) v2.push(second);
      if (first && second) {
        counts.matchedSettled++;
        matchedV1.push(first); matchedV2.push(second);
      } else if (!pair.v1 && second) {
        counts.newlySettled++;
        newlyPricedV2.push(second);
      }
    }
  }
  return { ...counts, evaluatedAt, minimumCalibrationSample,
    v1: replayFeaturedCalibration(v1), v2: replayFeaturedCalibration(v2),
    matched: { v1: replayFeaturedCalibration(matchedV1), v2: replayFeaturedCalibration(matchedV2) },
    newlyPricedV2: replayFeaturedCalibration(newlyPricedV2) };
}
