import { defaultSlipCriteria, buildSlips, type BuiltSlip, type SlipCriteria } from "./slip-builder.ts";
import { jointSlipBuilder, type JointSlipModel } from "./joint-slip-model.ts";
export { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
import type { ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: 450, maximumTotal: 550, count: 10 });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export type BestSlipSummary = Readonly<{ rank: number; totalOdds?: string; estimatedProbability?: number; matchCount: number }>;
export type BestSlipView = BestSlipSummary & Readonly<{ slip?: BestSlip }>;
export type BestSlipsResult = Readonly<{
  day: ReportingDate; state: SlipBuildState | "model-unavailable"; slips: readonly BestSlipView[];
  searchLimited: boolean; partialCoverage: boolean;
}>;

export function bestSlipCriteria(today: string, target: Readonly<{ minimumTotal: number; maximumTotal: number; count: number }> = bestSlipsRules): SlipCriteria {
  return { ...defaultSlipCriteria(today), dateTo: today, totalMin: target.minimumTotal, totalMax: target.maximumTotal,
    slips: target.count, reuse: false };
}

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    const result = jointSlipBuilder(model)(criteria, records, asOf);
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Explicit allowlist: even internal slip IDs contain fixture/selection identifiers. */
export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean): readonly BestSlipView[] {
  return slips.map((slip, index) => ({ rank: index + 1, matchCount: slip.selections.length,
    ...(entitled ? { totalOdds: slip.totalOdds, estimatedProbability: slip.estimatedProbability, slip } : {}) }));
}
