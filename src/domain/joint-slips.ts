import { probabilityFraction } from "./feed-query.ts";
import { buildSlips, type BuiltSlip, type RankedSlip, type SlipCriteria, type SlipRanking, type SlipSelection } from "./slip-builder.ts";

/** Only an approved, calibrated joint model may implement this contract. No independence fallback. */
export type JointSlipModel = Readonly<{
  calibrationReference: string;
  correlationReference: string;
  validFrom: number;
  validUntil: number;
  estimate: (selections: readonly SlipSelection[]) => number | null;
}>;

export function qualifiedJointModel(model: JointSlipModel | null, at: number): model is JointSlipModel {
  return !!model && !!model.calibrationReference.trim() && !!model.correlationReference.trim()
    && Number.isFinite(model.validFrom) && Number.isFinite(model.validUntil) && model.validFrom <= at && at < model.validUntil;
}

/** Joint estimates must also respect the mathematical bounds of their marginal probabilities. */
export function jointSlipProbability(model: JointSlipModel, slip: BuiltSlip): number | null {
  const value = model.estimate(slip.selections), probabilities = slip.selections.map((selection) => selection.probability);
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1 || probabilities.length === 0) return null;
  const lower = Math.max(0, probabilities.reduce((sum, probability) => sum + probability, 0) - probabilities.length + 1);
  const upper = Math.min(...probabilities);
  // Summing decimal marginals can move a valid boundary by a few floating-point ULPs.
  const tolerance = Number.EPSILON * probabilities.length * 2;
  return value >= lower - tolerance && value <= upper + tolerance ? Math.min(upper, Math.max(lower, value)) : null;
}

/** One definition for Best Slips and custom builds: estimate first; selection count only breaks equal estimates.
 * Combinations without a valid estimate are excluded and counted, never ranked by a mean or product of marginals. */
export function jointSlipRanking(model: JointSlipModel, bounds: Pick<SlipCriteria, "jointMin" | "jointMax">) {
  // Keyed by object: unretained combinations stay collectable (an id can reach ~1.4 KB across 100k enumerated nodes).
  const estimates = new WeakMap<BuiltSlip, number | null>();
  const minimum = probabilityFraction(bounds.jointMin), maximum = probabilityFraction(bounds.jointMax);
  let unestimated = 0;
  const probability = (slip: BuiltSlip) => {
    if (!estimates.has(slip)) {
      const value = jointSlipProbability(model, slip);
      if (value === null) unestimated++;
      estimates.set(slip, value);
    }
    return estimates.get(slip)!;
  };
  const ranking: SlipRanking = {
    accepts: (slip) => { const value = probability(slip); return value !== null && value >= minimum && value <= maximum; },
    compare: (left, right) => probability(right)! - probability(left)! || left.selections.length - right.selections.length
      || Number(right.totalOdds) - Number(left.totalOdds) || left.id.localeCompare(right.id),
  };
  return { ranking, probability, unestimated: () => unestimated };
}

/** Custom builds rank by a current qualified joint estimate when one is bound; otherwise they stay byte-identical to `buildSlips`. */
export function customSlipBuilder(model: JointSlipModel | null) {
  return ((criteria, records, asOf) => {
    // Unchanged average ranking; `buildSlips` itself rejects whole-slip bounds without a joint ranking.
    if (!qualifiedJointModel(model, asOf)) return buildSlips(criteria, records, asOf);
    const joint = jointSlipRanking(model, criteria), result = buildSlips(criteria, records, asOf, joint.ranking);
    // Rows keep kickoff order; only the slip order follows the estimate.
    return { ...result, joint: { unestimated: joint.unestimated() },
      slips: result.slips.map((slip): RankedSlip => ({ ...slip, estimatedProbability: joint.probability(slip)! })) };
  }) satisfies typeof buildSlips;
}
