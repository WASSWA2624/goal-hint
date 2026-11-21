import { defaultSlipCriteria, buildSlips, type BuiltSlip, type EditorialSlipSearch, type SlipCriteria, type SlipSelection } from "./slip-builder.ts";
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

export const bestSlipsRules = Object.freeze({ minimumTotal: bestSlipBand().minimumTotal, maximumTotal: bestSlipBand().maximumTotal,
  count: bestSlipOddsBands.length * bestSlipBandLimit, perBand: dailyBestSlipBandLimit });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export function bestSlipExactTotal(selections: readonly SlipSelection[]) {
  const denominator = 10_000n ** BigInt(selections.length);
  const product = selections.reduce((value, selection) => value * (parseDecimalOdds(selection.odds)?.scaled ?? 0n), 1n);
  return { product, denominator };
}

export function bestSlipSelectionIdentity({ fixtureId, family, selection }: SlipSelection): string {
  return `${fixtureId}:${family}:${selection}`;
}

export function bestSlipCombinationIdentity(selections: readonly SlipSelection[]): string {
  return selections.map(bestSlipSelectionIdentity).sort().join("|");
}

function compareBestSlipPrices(left: BuiltSlip, right: BuiltSlip, a: ReturnType<typeof bestSlipExactTotal>, b: ReturnType<typeof bestSlipExactTotal>) {
  const price = b.product * a.denominator - a.product * b.denominator;
  return (price > 0n ? 1 : price < 0n ? -1 : 0) || left.selections.length - right.selections.length || left.id.localeCompare(right.id);
}
export function compareBestSlips(left: BestSlip, right: BestSlip): number {
  return right.estimatedProbability - left.estimatedProbability ||
    compareBestSlipPrices(left, right, bestSlipExactTotal(left.selections), bestSlipExactTotal(right.selections));
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
export type BestSlipView = SlipPreviewView & Readonly<{ estimatedProbability: number; slip?: BestSlip }>;
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

export function buildDailyBestSlips(day: ReportingDate, band: BestSlipOddsBand, model: JointSlipModel, asOf: number,
  editorial: Omit<EditorialSlipSearch, "exclusiveMaximum">, priorCombinations: ReadonlySet<string>) {
  if (!qualifiedJointModel(model, asOf)) throw new RangeError("A current calibrated joint model is required.");
  const joint = jointSlipRanking(model);
  const prices = new WeakMap<BuiltSlip, ReturnType<typeof bestSlipExactTotal>>();
  const exactPrice = (slip: BuiltSlip) => {
    const price = prices.get(slip) ?? bestSlipExactTotal(slip.selections);
    prices.set(slip, price);
    return price;
  };
  const result = buildSlips(bestSlipDailyCriteria(day, band), [], asOf, {
    probability: joint.probability,
    accepts: (slip) => !priorCombinations.has(bestSlipCombinationIdentity(slip.selections)) && joint.ranking.accepts(slip),
    compare: (left, right) => joint.probability(right)! - joint.probability(left)! || compareBestSlipPrices(left, right, exactPrice(left), exactPrice(right)),
  }, { editorial: { ...editorial, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
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
export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean, matchStates?: readonly SlipMatchState[]): readonly BestSlipView[] {
  return [...slips].sort(compareBestSlips).map((slip, index) => ({ rank: index + 1, matchCount: slip.selections.length,
    totalOdds: slip.totalOdds, estimatedProbability: slip.estimatedProbability, averageProbability: slip.averageProbability,
    ...(entitled ? { slip, ...(matchStates ? { matchStates: slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, matchStates); return state ? [state] : [];
    }) } : {}) } : {}) }));
}
