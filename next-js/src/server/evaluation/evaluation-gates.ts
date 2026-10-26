import "server-only";

import type { EvaluationMetrics, QualityGate } from "./evaluation-contract.ts";

/** Numeric diagnostics only. Passing these criteria never authorizes a public claim. */
export function evaluateQualityGate(gate: QualityGate, metrics: EvaluationMetrics,
  coverage: Readonly<{ total: number; void: number; available: number }>,
  comparison?: Readonly<{ count: number; brierDifference: number | null }>) {
  const reasons: string[] = [], failures: string[] = [];
  const eligible = coverage.total - coverage.void, ratio = eligible === 0 ? null : coverage.available / eligible;
  if (metrics.count < gate.minimumSamples) reasons.push("insufficient-settled-samples");
  if (ratio === null) reasons.push("no-eligible-coverage-denominator");
  else if (ratio < gate.minimumCoverage) failures.push("coverage-below-gate");
  for (const [observed, maximum, reason] of [[metrics.brier, gate.maximumBrier, "brier-above-gate"],
    [metrics.logLoss, gate.maximumLogLoss, "log-loss-above-gate"],
    [metrics.calibrationError, gate.maximumCalibrationError, "calibration-error-above-gate"]] as const) {
    if (maximum !== null) {
      if (observed === null) reasons.push("missing-score");
      else if (observed > maximum) failures.push(reason);
    }
  }
  if (gate.baseline !== null) {
    if (!comparison || comparison.count < gate.minimumSamples || comparison.brierDifference === null) reasons.push("insufficient-matched-baseline-samples");
    else if (comparison.brierDifference > gate.maximumBrierDifference!) failures.push("matched-brier-difference-above-gate");
  }
  return { diagnostic: reasons.length > 0 ? "pending" as const : failures.length > 0 ? "failed" as const : "passed" as const, reasons, failures };
}
