import { defaultSlipCriteria, buildSlips, slipCombinationIdentity as bestSlipCombinationIdentity,
  type BuiltSlip, type EditorialSlipSearch, type SlipCriteria, type SlipSelection } from "./slip-builder.ts";
export { bestSlipCombinationIdentity };
export { slipSelectionIdentity as bestSlipSelectionIdentity } from "./slip-builder.ts";
import { oddsRules, parseDecimalOdds } from "./odds.ts";
import { jointSlipBuilder, jointSlipRanking, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
export { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
import type { ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "./slip-match-state.ts";
import type { BestSlipsQuery } from "./best-slips-query.ts";
import type { SlipStatus } from "./slip-status.ts";
import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { CardSnapshotPick } from "./match-card.ts";
import type { PeriodPerformance } from "./browse-period.ts";
import type { ContentAccess } from "./paywall.ts";
import { bestSlipBand, bestSlipBandLimit, bestSlipExactRange, bestSlipOddsBands, dailyBestSlipBandLimit, defaultBestSlipOddsBand, type BestSlipOddsBand } from "./best-slip-odds-bands.ts";
import { bestSlipKickoffBufferMs, bestSlipPreferredKickoffWindowMs } from "./best-slip-publication-hour.ts";
import { slipProbabilityLowerBound } from "./slip-probability.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: bestSlipBand().minimumTotal, maximumTotal: bestSlipBand().maximumTotal,
  count: bestSlipOddsBands.length * bestSlipBandLimit, perBand: dailyBestSlipBandLimit });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export function bestSlipExactTotal(selections: readonly SlipSelection[]) {
  const denominator = 10_000n ** BigInt(selections.length);
  const product = selections.reduce((value, selection) => value * (parseDecimalOdds(selection.odds)?.scaled ?? 0n), 1n);
  return { product, denominator };
}

function compareBestSlipPrices(a: ReturnType<typeof bestSlipExactTotal>, b: ReturnType<typeof bestSlipExactTotal>) {
  const price = b.product * a.denominator - a.product * b.denominator;
  return price > 0n ? 1 : price < 0n ? -1 : 0;
}
export function compareBestSlips(left: BestSlip, right: BestSlip): number {
  return right.estimatedProbability - left.estimatedProbability ||
    compareBestSlipPrices(bestSlipExactTotal(left.selections), bestSlipExactTotal(right.selections))
    || left.selections.length - right.selections.length || left.id.localeCompare(right.id);
}
export type BestSlipSummary = Readonly<{
  rank: number; totalOdds: string; estimatedProbability: number; averageProbability: number; matchCount: number;
}>;
export type SlipPreviewView = Omit<BestSlipSummary, "estimatedProbability"> & Readonly<{
  estimatedProbability?: number; slip?: BuiltSlip; matchStates?: readonly SlipMatchState[];
  preview?: readonly Readonly<{ fixture: FixtureSnapshot; pick: CardSnapshotPick | null }>[];
  /** Internal read proof; removed by the response projection. Never inferred from slip outcome. */
  completedFixtureIds?: readonly string[];
  id?: string; publicationDay?: ReportingDate; publishedAt?: number; outcome?: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
  /** Server proof that every original selection and its canonical fixture are complete. */
  completed?: boolean;
}>;
export type BestSlipView = SlipPreviewView;
export type SlipsBrowseResult<T extends SlipPreviewView = SlipPreviewView> = Readonly<{
  day: ReportingDate; state: SlipBuildState | "awaiting-publication"; slips: readonly T[];
  /** Unfinished prediction access, freshly checked at the response boundary. */
  entitled?: boolean;
  access?: ContentAccess;
  searchLimited: boolean; partialCoverage: boolean;
  /** The cohort matching the date, odds, probability and match count filters before result filtering or pagination. */
  statistics?: PerformanceSummaryCounts | null;
  summary?: PeriodPerformance;
  browse?: Readonly<{
    query: BestSlipsQuery; firstPage?: number; version?: string | null; total: number | null; pageSize: number; hasMore: boolean; nextCursor: string | null;
    /** Audited band membership before probability, match count and result filters. Unknown across a bounded All dates scan. */
    bandTotal?: number | null;
    /** The current daily capacity when the entire selected day and band use the modern publication rules. */
    dailyBandLimit?: number;
    /** Requested range for exact totals; actually scanned publication dates for All dates. */
    from: ReportingDate | null; to: ReportingDate | null;
  }>;
}>;

export type BestSlipsResult = SlipsBrowseResult<BestSlipView>;

export function bestSlipCriteria(today: string, target: Readonly<{ minimumTotal: number; maximumTotal: number; count: number }>
  = { ...bestSlipBand(defaultBestSlipOddsBand), count: bestSlipBandLimit }): SlipCriteria {
  return { ...defaultSlipCriteria(today), dateTo: today, totalMin: target.minimumTotal, totalMax: target.maximumTotal,
    oddsMin: oddsRules.minimumHundredths, oddsMax: oddsRules.maximumHundredths, teamsMax: 8, slips: target.count, reuse: false };
}

export function bestSlipBandCriteria(today: string, band: BestSlipOddsBand): SlipCriteria {
  return bestSlipCriteria(today, { ...bestSlipBand(band), count: bestSlipBandLimit });
}

export function bestSlipDailyCriteria(today: string, band: BestSlipOddsBand): SlipCriteria {
  const { minimum, maximum } = bestSlipExactRange(band);
  return { ...bestSlipCriteria(today, { minimumTotal: minimum, maximumTotal: maximum, count: dailyBestSlipBandLimit }), probMin: 0 };
}

function cachedPriceOrder() {
  const prices = new WeakMap<BuiltSlip, ReturnType<typeof bestSlipExactTotal>>();
  const exactPrice = (slip: BuiltSlip) => {
    const price = prices.get(slip) ?? bestSlipExactTotal(slip.selections);
    prices.set(slip, price);
    return price;
  };
  return (left: BuiltSlip, right: BuiltSlip) => compareBestSlipPrices(exactPrice(left), exactPrice(right));
}

/** The union bound gives a joint lower bound without assuming independent selections. */
export function buildHourlyBestSlips(day: ReportingDate, band: BestSlipOddsBand, capacity: number, asOf: number,
  editorial: Omit<EditorialSlipSearch, "exclusiveMaximum" | "combinationIdentity">, priorCombinations: ReadonlySet<string>,
  preferredKickoffWindowMs = bestSlipPreferredKickoffWindowMs) {
  const comparePrice = cachedPriceOrder();
  const earliestKickoff = (slip: BuiltSlip) => Math.min(...slip.selections.map(({ kickoffAt }) => kickoffAt));
  const cohesive = (slip: BuiltSlip) => Math.max(...slip.selections.map(({ kickoffAt }) => kickoffAt)) - earliestKickoff(slip) <= preferredKickoffWindowMs;
  const lowerBound = (slip: BuiltSlip) => slipProbabilityLowerBound(slip.averageProbability * slip.selections.length, slip.selections.length);
  const bestAvailable = editorial.selections.filter(({ fixtureId, kickoffAt }) => !editorial.priorFixtures?.has(fixtureId)
    && kickoffAt - asOf >= bestSlipKickoffBufferMs);
  const compare = (left: BuiltSlip, right: BuiltSlip) => lowerBound(right) - lowerBound(left)
    || right.averageProbability - left.averageProbability || comparePrice(left, right)
    || left.selections.length - right.selections.length || Number(cohesive(right)) - Number(cohesive(left)) || left.id.localeCompare(right.id);
  const result = buildSlips({ ...bestSlipDailyCriteria(day, band), slips: capacity }, [], asOf, {
    // Let a later check consider far-out combinations when at least one leg enters the release window.
    accepts: (slip) => earliestKickoff(slip) - asOf <= preferredKickoffWindowMs && !priorCombinations.has(bestSlipCombinationIdentity(slip.selections)),
    compare,
  }, { editorial: { ...editorial, selections: bestAvailable, prioritizeRank: true,
    combinationIdentity: bestSlipCombinationIdentity, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
  return { ...result, slips: [...result.slips].sort(compare) };
}

export function buildDailyBestSlips(day: ReportingDate, band: BestSlipOddsBand, model: JointSlipModel, asOf: number,
  editorial: Omit<EditorialSlipSearch, "exclusiveMaximum" | "combinationIdentity">, priorCombinations: ReadonlySet<string>) {
  if (!qualifiedJointModel(model, asOf)) throw new RangeError("A current calibrated joint model is required.");
  const joint = jointSlipRanking(model);
  const comparePrice = cachedPriceOrder();
  const result = buildSlips(bestSlipDailyCriteria(day, band), [], asOf, {
    probability: joint.probability,
    accepts: (slip) => !priorCombinations.has(bestSlipCombinationIdentity(slip.selections)) && joint.ranking.accepts(slip),
    compare: (left, right) => joint.probability(right)! - joint.probability(left)! || comparePrice(left, right)
      || left.selections.length - right.selections.length || left.id.localeCompare(right.id),
  }, { editorial: { ...editorial, combinationIdentity: bestSlipCombinationIdentity, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
  return { ...result, excludedUnestimated: joint.unestimated(), slips: result.slips.map((slip): BestSlip =>
    ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]! })) };
}

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    const result = jointSlipBuilder(model)(criteria, records, asOf);
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Aggregate projection allowlist; viewer access and completion eligibility are enforced by the slip service. */
export function bestSlipView(slip: BuiltSlip & Readonly<{ estimatedProbability?: number }>, rank: number,
  entitled: boolean, matchStates?: readonly SlipMatchState[]): BestSlipView {
  return { rank, matchCount: slip.selections.length, totalOdds: slip.totalOdds,
    ...(slip.estimatedProbability === undefined ? {} : { estimatedProbability: slip.estimatedProbability }),
    averageProbability: slip.averageProbability,
    ...(entitled ? { slip, ...(matchStates ? { matchStates: slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, matchStates); return state ? [state] : [];
    }) } : {}) } : {}) };
}

export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean, matchStates?: readonly SlipMatchState[]): readonly BestSlipView[] {
  return [...slips].sort(compareBestSlips).map((slip, index) => bestSlipView(slip, index + 1, entitled, matchStates));
}
