import { defaultSlipCriteria, buildSlips, compareSlipTotalOdds, type BuiltSlip, type SlipCriteria } from "./slip-builder.ts";
import { oddsRules } from "./odds.ts";
import { jointSlipBuilder, type JointSlipModel } from "./joint-slip-model.ts";
export { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
import type { ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "./slip-match-state.ts";
import type { BestSlipsQuery } from "./best-slips-query.ts";
import type { SlipStatus } from "./slip-status.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: 450, maximumTotal: 550, count: 100 });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export function compareBestSlips(left: BestSlip, right: BestSlip): number {
  return right.estimatedProbability - left.estimatedProbability || left.selections.length - right.selections.length
    || compareSlipTotalOdds(right.totalOdds, left.totalOdds) || left.id.localeCompare(right.id);
}
export type BestSlipSummary = Readonly<{
  rank: number; totalOdds: string; estimatedProbability: number; averageProbability: number; matchCount: number;
}>;
export type BestSlipView = BestSlipSummary & Readonly<{
  slip?: BestSlip; matchStates?: readonly SlipMatchState[];
  id?: string; publicationDay?: ReportingDate; publishedAt?: number; outcome?: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
}>;
export type BestSlipsResult = Readonly<{
  day: ReportingDate; state: SlipBuildState | "model-unavailable"; slips: readonly BestSlipView[];
  /** Current/future prediction access, freshly checked at the response boundary. */
  entitled?: boolean;
  searchLimited: boolean; partialCoverage: boolean;
  /** All slips in this daily publication, including those with active original cycles. */
  statistics?: PerformanceSummaryCounts | null;
  browse?: Readonly<{
    query: BestSlipsQuery; total: number | null; pageSize: number; hasMore: boolean; nextCursor: string | null;
    /** Requested range for exact totals; actually scanned publication dates for All dates. */
    from: ReportingDate | null; to: ReportingDate | null;
  }>;
}>;

export function bestSlipCriteria(today: string, target: Readonly<{ minimumTotal: number; maximumTotal: number; count: number }> = bestSlipsRules): SlipCriteria {
  return { ...defaultSlipCriteria(today), dateTo: today, totalMin: target.minimumTotal, totalMax: target.maximumTotal,
    oddsMin: oddsRules.minimumHundredths, oddsMax: oddsRules.maximumHundredths, probMin: 0, teamsMax: 8, slips: target.count, reuse: false };
}

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    const result = jointSlipBuilder(model)(criteria, records, asOf);
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Public aggregate allowlist: the displayed arithmetic mean is distinct from the joint estimate used for ranking. */
export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean, matchStates?: readonly SlipMatchState[]): readonly BestSlipView[] {
  return [...slips].sort(compareBestSlips).map((slip, index) => ({ rank: index + 1, matchCount: slip.selections.length,
    totalOdds: slip.totalOdds, estimatedProbability: slip.estimatedProbability, averageProbability: slip.averageProbability,
    ...(entitled ? { slip, ...(matchStates ? { matchStates: slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, matchStates); return state ? [state] : [];
    }) } : {}) } : {}) }));
}
