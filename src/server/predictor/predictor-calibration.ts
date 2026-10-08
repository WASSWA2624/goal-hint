import "server-only";

import { validateMarketSnapshot, type MarketSnapshot, type SourceGroup } from "../../domain/markets.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { ModelAuthority, ModelVersion } from "./predictor-contract.ts";
import { parseModelVersion } from "./predictor-input.ts";
import { assertCurrentPredictorOutputAuthority, assertValidatedPredictorOutput, type PredictorValidatedOutput } from "./predictor-output.ts";

export type PredictorCalibrationTransform = Readonly<{
  modelVersionId: string; version: string; method: string; evidenceRef: string; evaluationRef: string;
  /** A locally registered, evaluated implementation receives probabilities only. */
  transform(family: SourceGroup, probabilities: Readonly<Record<string, number>>, model: ModelVersion): unknown;
}>;
export type PredictorCalibrationOptions = Readonly<{
  model: ModelVersion; authority: ModelAuthority; transform?: PredictorCalibrationTransform | null;
  verifyTransform?: (transform: PredictorCalibrationTransform, model: ModelVersion) => boolean;
}>;
export type PredictorCalibrationStatus = Readonly<{
  kind: "none" | "evaluated"; version: string; method: string | null;
  appliedFamilies: readonly SourceGroup[]; evidenceRef: string; evaluationRef: string | null;
}>;
export type PredictorCalibratedOutput = PredictorValidatedOutput & Readonly<{
  calibration: PredictorCalibrationStatus; provisional: boolean;
  evaluation: Readonly<{ status: "provisional" | "evaluated"; version: string; evidenceRef: string; evaluationRef: string | null }>;
}>;
export type PredictorCalibrationResult = Readonly<{ valid: true; output: PredictorCalibratedOutput }> |
  Readonly<{ valid: false; reason: "invalid-candidate" | "not-authorized" | "unverified-calibration" | "unverified-evaluation" }>;
const families = ["match-result", "total-goals", "both-teams-to-score"] as const;
function sync(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
function trusted(check: () => boolean): boolean { try { return sync(check()) === true; } catch { return false; } }
function authorized(model: ModelVersion, authority: ModelAuthority): boolean {
  try { return sync(authority.authorize(model)) === undefined && trusted(() => authority.verifyModel(model)); } catch { return false; }
}
function candidates(snapshot: MarketSnapshot): Record<string, unknown> {
  return Object.fromEntries(families.flatMap((family) => {
    const candidate = snapshot.markets[family];
    if (!candidate.available) return [];
    return [[family, { source: "ai", period: candidate.market.period, probabilities: candidate.market.probabilities,
      ...(candidate.market.family === "total-goals" ? { line: candidate.market.line } : {}) }]];
  }));
}
/** No implicit transform or calibration claim. A verified artifact is required,
 * and every transformed distribution passes the same 005 rules again. */
export function applyPredictorCalibration(input: PredictorValidatedOutput, options: PredictorCalibrationOptions): PredictorCalibrationResult {
  const reject = (reason: Extract<PredictorCalibrationResult, { valid: false }>["reason"]): PredictorCalibrationResult => Object.freeze({ valid: false, reason });
  let model: ModelVersion;
  try { assertValidatedPredictorOutput(input); model = parseModelVersion(options.model); }
  catch { return reject("invalid-candidate"); }
  if (input.modelVersionId !== model.id) return reject("invalid-candidate");
  try { assertCurrentPredictorOutputAuthority(input); } catch { return reject("not-authorized"); }
  if (!authorized(model, options.authority)) return reject("not-authorized");
  if (!trusted(() => options.authority.verifyCalibration(model))) return reject("unverified-calibration");
  if (model.evaluation.status === "evaluated" && !trusted(() => options.authority.verifyEvaluation(model))) return reject("unverified-evaluation");
  const configuration = model.calibration, applied: SourceGroup[] = [];
  let markets = input.markets;
  if (configuration.kind === "evaluated") {
    const transform = options.transform;
    if (!transform || transform.modelVersionId !== model.id || transform.version !== configuration.version ||
      transform.method !== configuration.method || transform.evidenceRef !== configuration.evidenceRef ||
      transform.evaluationRef !== configuration.evaluationRef || !options.verifyTransform ||
      !trusted(() => options.verifyTransform!(transform, model))) return reject("unverified-calibration");
    const groups = candidates(input.markets);
    for (const family of configuration.sourceFamilies) {
      const current = input.markets.markets[family]; if (!current.available) continue;
      let probabilities: unknown;
      try { probabilities = sync(transform.transform(family, current.market.probabilities, model)); }
      catch { probabilities = undefined; }
      // Failure is unavailable rather than a silent return to the uncalibrated estimate.
      groups[family] = { source: "ai", period: current.market.period, probabilities,
        ...(family === "total-goals" ? { line: 2.5 } : {}) };
      applied.push(family);
    }
    const checked = validateMarketSnapshot(groups);
    // Invalid original families remain unavailable, with their original failure reasons.
    const preserved = Object.fromEntries(Object.entries(input.markets.markets).filter(([, availability]) => !availability.available));
    markets = freezeEvidence({ ...checked, markets: { ...checked.markets, ...preserved },
      issues: [...input.markets.issues, ...checked.issues.filter((issue) => issue.reason !== "missing-group")] });
  } else if (options.transform !== undefined && options.transform !== null) return reject("unverified-calibration");
  if (!authorized(model, options.authority)) return reject("not-authorized");
  if (!trusted(() => options.authority.verifyCalibration(model))) return reject("unverified-calibration");
  if (configuration.kind === "evaluated" && (!options.transform || !options.verifyTransform ||
    !trusted(() => options.verifyTransform!(options.transform!, model)))) return reject("unverified-calibration");
  if (model.evaluation.status === "evaluated" && !trusted(() => options.authority.verifyEvaluation(model))) return reject("unverified-evaluation");
  try { assertCurrentPredictorOutputAuthority(input); } catch { return reject("not-authorized"); }
  return freezeEvidence({ valid: true, output: { ...input, markets, provisional: model.evaluation.status !== "evaluated",
    evaluation: model.evaluation,
    calibration: { kind: configuration.kind, version: configuration.version,
      method: configuration.kind === "evaluated" ? configuration.method : null, appliedFamilies: applied,
      evidenceRef: configuration.evidenceRef, evaluationRef: configuration.kind === "evaluated" ? configuration.evaluationRef : null } } });
}
