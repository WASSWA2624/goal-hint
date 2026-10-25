import { buildSlips, type BuiltSlip, type SlipRanking, type SlipSelection } from "./slip-builder.ts";

/** Server bindings must independently verify calibration/correlation evidence; references alone are not approval. */
export type JointSlipModel = Readonly<{
  calibrationReference: string; correlationReference: string; validFrom: number; validUntil: number;
  estimate: (selections: readonly SlipSelection[]) => number | null;
}>;

export function qualifiedJointModel(model: JointSlipModel | null, at: number): model is JointSlipModel {
  return !!model && typeof model.calibrationReference === "string" && !!model.calibrationReference.trim()
    && typeof model.correlationReference === "string" && !!model.correlationReference.trim() && typeof model.estimate === "function"
    && Number.isFinite(at) && Number.isFinite(model.validFrom) && Number.isFinite(model.validUntil) && model.validFrom <= at && at < model.validUntil;
}

/** Reject estimates outside the Frechet bounds of the original marginal probabilities. */
export function jointSlipProbability(model: JointSlipModel, slip: BuiltSlip): number | null {
  const value = model.estimate(slip.selections), probabilities = slip.selections.map((selection) => selection.probability);
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1 || probabilities.length === 0) return null;
  const lower = Math.max(0, probabilities.reduce((sum, probability) => sum + probability, 0) - probabilities.length + 1);
  const upper = Math.min(...probabilities), tolerance = Number.EPSILON * probabilities.length * 2;
  return value >= lower - tolerance && value <= upper + tolerance ? Math.min(upper, Math.max(lower, value)) : null;
}

/** Unretained combinations stay collectable; a bounded search need not retain 100,000 long slip identifiers. */
export function jointSlipRanking(model: JointSlipModel) {
  const estimates = new WeakMap<BuiltSlip, number | null>();
  let unestimated = 0;
  const probability = (slip: BuiltSlip) => {
    if (!estimates.has(slip)) {
      const estimate = jointSlipProbability(model, slip);
      if (estimate === null) unestimated++;
      estimates.set(slip, estimate);
    }
    return estimates.get(slip)!;
  };
  const ranking: SlipRanking = {
    probability, accepts: (slip) => probability(slip) !== null,
    compare: (left, right) => probability(right)! - probability(left)! || left.selections.length - right.selections.length
      || Number(right.totalOdds) - Number(left.totalOdds) || left.id.localeCompare(right.id),
  };
  return { ranking, probability, unestimated: () => unestimated };
}

/** Shared by custom and daily slips: whole-slip probability precedes count, mean and price. No multiplication fallback. */
export function jointSlipBuilder(model: JointSlipModel): typeof buildSlips {
  return (criteria, records, asOf) => {
    if (!qualifiedJointModel(model, asOf)) throw new RangeError("A current calibrated joint model is required.");
    const joint = jointSlipRanking(model), result = buildSlips(criteria, records, asOf, joint.ranking);
    return { ...result, excludedUnestimated: joint.unestimated() };
  };
}
