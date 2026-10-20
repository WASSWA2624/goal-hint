import { defaultSlipCriteria, buildSlips, type BuiltSlip, type SlipCriteria, type SlipSelection } from "./slip-builder.ts";
import type { ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: 450, maximumTotal: 550, count: 10 });

/** Only an approved, calibrated joint model may implement this contract. No independence fallback. */
export type JointSlipModel = Readonly<{
  calibrationReference: string;
  correlationReference: string;
  validFrom: number;
  validUntil: number;
  estimate: (selections: readonly SlipSelection[]) => number | null;
}>;
export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export type BestSlipSummary = Readonly<{ rank: number; totalOdds: string; estimatedProbability: number; matchCount: number }>;
export type BestSlipView = BestSlipSummary & Readonly<{ slip?: BestSlip }>;
export type BestSlipsResult = Readonly<{
  day: ReportingDate; state: SlipBuildState | "model-unavailable"; slips: readonly BestSlipView[];
  searchLimited: boolean; partialCoverage: boolean;
}>;

export function bestSlipCriteria(today: string, target: Readonly<{ minimumTotal: number; maximumTotal: number; count: number }> = bestSlipsRules): SlipCriteria {
  return { ...defaultSlipCriteria(today), dateTo: today, totalMin: target.minimumTotal, totalMax: target.maximumTotal,
    slips: target.count, reuse: true };
}

export function qualifiedJointModel(model: JointSlipModel | null, at: number): model is JointSlipModel {
  return !!model && !!model.calibrationReference.trim() && !!model.correlationReference.trim()
    && Number.isFinite(model.validFrom) && Number.isFinite(model.validUntil) && model.validFrom <= at && at < model.validUntil;
}

/** Joint estimates must also respect the mathematical bounds of their marginal probabilities. */
export function jointSlipProbability(model: JointSlipModel, slip: BuiltSlip): number | null {
  const value = model.estimate(slip.selections), probabilities = slip.selections.map((selection) => selection.probability);
  if (value === null || !Number.isFinite(value) || probabilities.length === 0) return null;
  const lower = Math.max(0, probabilities.reduce((sum, probability) => sum + probability, 0) - probabilities.length + 1);
  const upper = Math.min(...probabilities);
  return value >= lower && value <= upper ? value : null;
}

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    if (!qualifiedJointModel(model, asOf)) throw new RangeError("A current calibrated joint model is required.");
    const estimates = new Map<string, number | null>();
    const probability = (slip: BuiltSlip) => {
      if (!estimates.has(slip.id)) estimates.set(slip.id, jointSlipProbability(model, slip));
      return estimates.get(slip.id)!;
    };
    const result = buildSlips(criteria, records, asOf, {
      accepts: (slip) => probability(slip) !== null,
      compare: (left, right) => probability(right)! - probability(left)! || left.selections.length - right.selections.length
        || Number(right.totalOdds) - Number(left.totalOdds) || left.id.localeCompare(right.id),
    });
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: probability(slip)!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Explicit allowlist: even internal slip IDs contain fixture/selection identifiers. */
export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean): readonly BestSlipView[] {
  return slips.map((slip, index) => ({ rank: index + 1, totalOdds: slip.totalOdds,
    estimatedProbability: slip.estimatedProbability, matchCount: slip.selections.length, ...(entitled ? { slip } : {}) }));
}
