import "server-only";

import type { LocalFeaturedDecision } from "../../domain/local-featured-decision.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey } from "../../domain/legacy-goal-market-identities.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { settleGoalSelection, type GoalMarketDefinition, type GoalSettlement, type GoalSettlementContext } from "../../domain/score-distribution-markets.ts";

type Mode = "standard" | "priced-fallback" | "forecast-only" | "abstained";
type Grade = GoalSettlement["status"] | "unverified-result" | "missing-market";
type SettledGrade = "correct" | "incorrect" | "half-win" | "half-loss" | "push";
type Decision = LocalFeaturedDecision;
type PricedDecision = Extract<Decision, { status: "priced" }>;
type Occurrence = Readonly<{ fixtureId: string; kickoffAt: number }>;
export type FeaturedHistoryComparison = Occurrence & Readonly<{
  cohort: string; decisionAt: number; definitions: readonly GoalMarketDefinition[];
  baseline: Decision; informed: Decision;
  /** Per-fixture unique candidate assessments produced during tie ranking. */
  history: Readonly<{ assessed: number; supported: number; scopes: Readonly<Record<string, number>>;
    context?: Readonly<{ competition: boolean; venue: boolean; strength: boolean }> }>;
}>;

type Sample = Readonly<{ mode: Mode; grade: Grade | null; probability: number | null; profit: bigint | null }>;
const stake = 20_000n;
export const featuredEvaluationOccurrence = ({ fixtureId, kickoffAt }: Occurrence) => `${fixtureId}:${kickoffAt}`;
const units = (ticks: bigint) => Number(ticks) / Number(stake);
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const mode = (decision: Decision): Mode => decision.status === "priced" ? decision.tier ?? "standard" : decision.status;

function isSettled(grade: Grade | null): grade is SettledGrade {
  return grade === "correct" || grade === "incorrect" || grade === "half-win" || grade === "half-loss" || grade === "push";
}

function quoteProfit(decision: PricedDecision, grade: SettledGrade): bigint | null {
  const quote = parseDecimalOdds(decision.quote.decimal);
  if (!quote) return null;
  const fullWin = (quote.scaled * 2n) - stake;
  switch (grade) {
    case "correct": return fullWin;
    case "incorrect": return -stake;
    case "half-win": return fullWin / 2n;
    case "half-loss": return -stake / 2n;
    case "push": return 0n;
  }
}

function gradeDecision(decision: Decision, definitions: ReadonlyMap<string, GoalMarketDefinition>, truth?: GoalSettlementContext): Sample {
  if (decision.status === "abstained") return { mode: mode(decision), grade: null, probability: null, profit: null };
  const legacy = isMarketFamily(decision.marketKey) ? { key: legacyForecastMarketKey(decision.marketKey),
    selection: canonicalLegacyForecastSelection(decision.marketKey, decision.selection) } : null;
  const definition = definitions.get(legacy?.key ?? decision.marketKey);
  const selection = legacy ? legacy.selection : decision.selection;
  const grade = !definition || selection === null ? "missing-market" : !truth ? "unverified-result" : settleGoalSelection(definition, selection, truth).status;
  const profit = decision.status === "priced" && isSettled(grade) ? quoteProfit(decision, grade) : null;
  return { mode: mode(decision), grade, probability: decision.probability, profit };
}

function tally(values: Iterable<string>) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function summarize(samples: readonly Sample[]) {
  const graded = samples.filter(({ grade }) => isSettled(grade));
  const wins = graded.filter(({ grade }) => grade === "correct").length;
  const returns = samples.flatMap(({ profit }) => profit === null ? [] : [profit]);
  const profit = returns.reduce((sum, value) => sum + value, 0n);
  return { fixtures: samples.length, modes: tally(samples.map((sample) => sample.mode)),
    grades: tally(samples.flatMap(({ grade }) => grade === null ? [] : [grade])), settled: graded.length, outrightWins: wins,
    outrightWinRate: graded.length ? wins / graded.length : null, meanRawWinProbability: mean(graded.map(({ probability }) => probability!)),
    rawWinBrier: mean(graded.map(({ grade, probability }) => (Number(grade === "correct") - probability!) ** 2)),
    pricedSettled: returns.length, stakeUnits: returns.length, profitUnits: units(profit),
    realizedReturnPerUnit: returns.length ? units(profit) / returns.length : null };
}

const outcomeChanged = (left: Decision, right: Decision) => {
  if (left.status === "abstained" || right.status === "abstained") return left.status !== right.status;
  return left.marketKey !== right.marketKey || left.selection !== right.selection;
};

function summarizePaired(rows: readonly { baseline: Sample; informed: Sample; changed: boolean }[]) {
  const common = rows.filter(({ baseline, informed }) => isSettled(baseline.grade) && isSettled(informed.grade));
  const priced = common.filter(({ baseline, informed }) => baseline.profit !== null && informed.profit !== null);
  const profitDelta = priced.reduce((sum, { baseline, informed }) => sum + informed.profit! - baseline.profit!, 0n);
  const baselineWins = common.filter(({ baseline }) => baseline.grade === "correct").length;
  const informedWins = common.filter(({ informed }) => informed.grade === "correct").length;
  return { fixtures: rows.length, bothSettled: common.length, bothPricedSettled: priced.length, baselineOutrightWins: baselineWins,
    informedOutrightWins: informedWins, outrightWinRateDelta: common.length ? (informedWins - baselineWins) / common.length : null,
    realizedProfitDeltaUnits: units(profitDelta), realizedReturnDeltaPerUnit: priced.length ? units(profitDelta) / priced.length : null,
    improvedPriced: priced.filter(({ baseline, informed }) => informed.profit! > baseline.profit!).length,
    worsenedPriced: priced.filter(({ baseline, informed }) => informed.profit! < baseline.profit!).length };
}

function summarizeGroup(comparisons: readonly FeaturedHistoryComparison[], truth: ReadonlyMap<string, GoalSettlementContext>) {
  const rows = comparisons.map((item) => {
    const context = truth.get(featuredEvaluationOccurrence(item));
    const definitions = new Map(item.definitions.map((definition) => [definition.key, definition]));
    return { baseline: gradeDecision(item.baseline, definitions, context), informed: gradeDecision(item.informed, definitions, context),
      changed: outcomeChanged(item.baseline, item.informed) };
  });
  const history = { assessedCandidates: 0, supportedCandidates: 0, fixturesWithRankingTies: 0, fixturesWithSupport: 0,
    fixturesWithSparseFallback: 0, verifiedCompetitionContextFixtures: 0, verifiedVenueContextFixtures: 0,
    verifiedStrengthContextFixtures: 0, scopes: {} as Record<string, number> };
  for (const { history: entry } of comparisons) {
    history.assessedCandidates += entry.assessed;
    history.supportedCandidates += entry.supported;
    history.fixturesWithRankingTies += Number(entry.assessed > 0);
    history.fixturesWithSupport += Number(entry.supported > 0);
    history.fixturesWithSparseFallback += Number(entry.assessed > 0 && entry.supported === 0);
    history.verifiedCompetitionContextFixtures += Number(entry.context?.competition === true);
    history.verifiedVenueContextFixtures += Number(entry.context?.venue === true);
    history.verifiedStrengthContextFixtures += Number(entry.context?.strength === true);
    for (const [scope, count] of Object.entries(entry.scopes)) history.scopes[scope] = (history.scopes[scope] ?? 0) + count;
  }
  const changed = rows.filter((row) => row.changed);
  return { comparisons: rows.length, changedOutcomes: changed.length, history,
    baseline: summarize(rows.map(({ baseline }) => baseline)), informed: summarize(rows.map(({ informed }) => informed)),
    paired: summarizePaired(rows), changed: summarizePaired(changed),
    tierTransitions: tally(rows.map(({ baseline, informed }) => `${baseline.mode}→${informed.mode}`)) };
}

/** The later result map is used here, after both decisions have already been frozen. */
export function summarizeFeaturedHistoryComparison(comparisons: readonly FeaturedHistoryComparison[],
  truth: ReadonlyMap<string, GoalSettlementContext>) {
  const identity = new Set<string>(), cohorts = new Map<string, FeaturedHistoryComparison[]>();
  for (const item of comparisons) {
    const key = featuredEvaluationOccurrence(item);
    if (!Number.isSafeInteger(item.kickoffAt) || !Number.isSafeInteger(item.decisionAt) || item.decisionAt < 0 ||
      item.decisionAt >= item.kickoffAt || identity.has(key))
      throw new RangeError("Comparison contains invalid or duplicate decision clocks for an occurrence.");
    identity.add(key);
    const bucket = cohorts.get(item.cohort) ?? [];
    bucket.push(item);
    cohorts.set(item.cohort, bucket);
  }
  return { basis: "one-unit-per-settled-exact-pre-cutoff-quote", total: summarizeGroup(comparisons, truth),
    byCohort: Object.fromEntries([...cohorts].map(([key, group]) => [key, summarizeGroup(group, truth)])) };
}
