import assert from "node:assert/strict";
import test from "node:test";
import { applyPredictorCalibration } from "../src/server/predictor/predictor-calibration.ts";
import { validatePredictorOutput } from "../src/server/predictor/predictor-output.ts";
import { evidenceAuthority } from "./helpers/evidence-fixtures.mjs";
import { modelAuthority, modelVersion } from "./helpers/predictor-fixtures.mjs";
import { predictorAcceptedOutput, predictorOutputOptions, predictorRawOutput, predictorSnapshot } from "./helpers/predictor-output-fixtures.mjs";

function evaluatedModel(overrides = {}) {
  const cutoff = predictorSnapshot().context.cutoffAt;
  return modelVersion({ windows: { calibration: { startsAt: cutoff - 200_000, endsAt: cutoff - 100_000 },
    finalTest: { startsAt: cutoff - 90_000, endsAt: cutoff - 10_000 } },
  calibration: { kind: "evaluated", version: "synthetic-transform-v1", method: "synthetic-test-method", parameters: { value: 0.5 },
    sourceFamilies: ["total-goals"], evidenceRef: "synthetic-transform-proof", evaluationRef: "synthetic-calibration-evaluation-proof" },
  evaluation: { status: "evaluated", version: "synthetic-evaluation-v1", evidenceRef: "synthetic-quality-proof", evaluationRef: "synthetic-final-test-proof" },
  ...overrides });
}
function options(model, transform = (_family, distribution) => distribution, overrides = {}) {
  return { model, authority: modelAuthority(), transform: { modelVersionId: model.id, version: model.calibration.version,
    method: model.calibration.method, evidenceRef: model.calibration.evidenceRef, evaluationRef: model.calibration.evaluationRef, transform },
  verifyTransform: () => true, ...overrides };
}
const accepted = (input, configuration) => { const result = applyPredictorCalibration(input, configuration); assert.equal(result.valid, true, result.reason); return result.output; };
test("explicit no-calibration is an identity operation and unvalidated estimates remain provisional", () => {
  const model = modelVersion(), input = predictorAcceptedOutput(predictorSnapshot(), model), output = accepted(input, { model, authority: modelAuthority() });
  assert.equal(output.markets, input.markets); assert.equal(output.provisional, true);
  assert.deepEqual(output.calibration, { kind: "none", version: model.calibration.version, method: null, appliedFamilies: [], evidenceRef: model.calibration.evidenceRef, evaluationRef: null });
  assert.equal(output.evaluation.status, "provisional"); assert.equal(output.timestamps, input.timestamps);
});
test("independent evaluated raw estimates require trusted evaluation proof and do not claim numerical calibration", () => {
  const cutoff = predictorSnapshot().context.cutoffAt, model = modelVersion({ windows: { finalTest: { startsAt: cutoff - 1000, endsAt: cutoff - 1 } },
    evaluation: { status: "evaluated", version: "synthetic-raw-evaluation-v1", evidenceRef: "synthetic-raw-evaluation-proof", evaluationRef: "synthetic-raw-final-test-proof" } });
  const input = predictorAcceptedOutput(predictorSnapshot(), model), output = accepted(input, { model, authority: modelAuthority() });
  assert.equal(output.provisional, false); assert.equal(output.calibration.kind, "none"); assert.deepEqual(output.calibration.appliedFamilies, []);
  assert.deepEqual(applyPredictorCalibration(input, { model, authority: modelAuthority({ verifyEvaluation: () => false }) }), { valid: false, reason: "unverified-evaluation" });
});
test("verified family-specific transforms revalidate distributions and retain all model/evidence provenance", () => {
  const model = evaluatedModel(), input = predictorAcceptedOutput(predictorSnapshot(), model), calls = [];
  const output = accepted(input, options(model, (family, distribution, pinned) => { calls.push({ family, distribution, id: pinned.id }); return { "over-2.5": 0.5, "under-2.5": 0.5 }; }));
  assert.deepEqual(calls.map((call) => call.family), ["total-goals"]); assert.equal(calls[0].id, model.id);
  assert.deepEqual(output.markets.markets["total-goals"].market.probabilities, { "over-2.5": 0.5, "under-2.5": 0.5 });
  assert.deepEqual(output.markets.markets["match-result"], input.markets.markets["match-result"]);
  assert.deepEqual(output.calibration.appliedFamilies, ["total-goals"]); assert.equal(output.provisional, false);
  assert.equal(output.evidenceHash, input.evidenceHash); assert.deepEqual(output.sources, input.sources); assert.deepEqual(output.timestamps, input.timestamps);
  assert.equal(output.evidence, input.evidence); assert.ok(output.evidence.coverage.labels.includes("Limited news coverage"));
});
test("successful transport cannot authorize an unregistered, wrong-version or unverified calibration transform", () => {
  const model = evaluatedModel(), input = predictorAcceptedOutput(predictorSnapshot(), model), configuration = options(model);
  assert.deepEqual(applyPredictorCalibration(input, { model, authority: modelAuthority() }), { valid: false, reason: "unverified-calibration" });
  for (const change of [{ modelVersionId: "0".repeat(64) }, { version: "wrong-version" }, { method: "wrong-method" },
    { evidenceRef: "wrong-proof" }, { evaluationRef: "wrong-evaluation" }]) {
    assert.deepEqual(applyPredictorCalibration(input, { ...configuration, transform: { ...configuration.transform, ...change } }), { valid: false, reason: "unverified-calibration" });
  }
  for (const verifyTransform of [() => false, async () => true, () => { throw new Error("private artifact path"); }])
    assert.deepEqual(applyPredictorCalibration(input, { ...configuration, verifyTransform }), { valid: false, reason: "unverified-calibration" });
  assert.deepEqual(applyPredictorCalibration(input, options(model, undefined, { authority: modelAuthority({ verifyCalibration: () => false }) })), { valid: false, reason: "unverified-calibration" });
});
test("invalid transformed groups remain unavailable rather than silently restoring raw estimates", () => {
  const model = evaluatedModel(), input = predictorAcceptedOutput(predictorSnapshot(), model);
  for (const [transform, reason] of [[() => ({ "over-2.5": 0.8 }), "incomplete-group"], [() => ({ "over-2.5": NaN, "under-2.5": 0.5 }), "invalid-probability"],
    [() => ({ "over-2.5": 0.8, "under-2.5": 0.8 }), "invalid-sum"], [() => { throw new Error("private transform failure"); }, "incomplete-group"],
    [async () => ({ "over-2.5": 0.5, "under-2.5": 0.5 }), "incomplete-group"]]) {
    const output = accepted(input, options(model, transform));
    assert.deepEqual(output.markets.markets["total-goals"], { available: false, reason });
    assert.equal(output.markets.markets["match-result"].available, true);
    assert.equal(output.markets.markets["double-chance"].available, true);
  }
});
test("post-transform cross-market conflicts and match-result double chance are handled by shared rules", () => {
  const model = evaluatedModel(), input = predictorAcceptedOutput(predictorSnapshot(), model);
  const conflict = accepted(input, options(model, () => ({ "over-2.5": 0.1, "under-2.5": 0.9 })));
  for (const market of Object.values(conflict.markets.markets)) assert.deepEqual(market, { available: false, reason: "cross-market-conflict" });
  const resultModel = evaluatedModel({ calibration: { ...model.calibration, sourceFamilies: ["match-result"] } }), resultInput = predictorAcceptedOutput(predictorSnapshot(), resultModel);
  const transformed = accepted(resultInput, options(resultModel, () => ({ "home-win": 0.5, draw: 0.25, "away-win": 0.25 })));
  assert.deepEqual(transformed.markets.markets["double-chance"].market.probabilities, { "home-or-draw": 0.75, "away-or-draw": 0.5, "home-or-away": 0.75 });
});
test("calibration cannot restore unavailable raw families or transform unsupported families", () => {
  const model = evaluatedModel(), snapshot = predictorSnapshot(), input = predictorAcceptedOutput(snapshot, model, { groups: {
    "match-result": { period: "regulation-including-stoppage-time", probabilities: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } },
    "total-goals": { period: "regulation-including-stoppage-time", line: 3.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
    "both-teams-to-score": null } });
  let calls = 0; const output = accepted(input, options(model, () => { calls += 1; return { "over-2.5": 0.5, "under-2.5": 0.5 }; }));
  assert.equal(calls, 0); assert.deepEqual(output.calibration.appliedFamilies, []);
  assert.deepEqual(output.markets.markets["total-goals"], { available: false, reason: "unsupported-line" });
  assert.deepEqual(output.markets.markets["both-teams-to-score"], { available: false, reason: "missing-group" });
});
test("model-authored evaluated flags, cloned or modified candidates and changed model configurations cannot bypass approval", () => {
  const model = modelVersion(), input = predictorAcceptedOutput(predictorSnapshot(), model);
  assert.deepEqual(applyPredictorCalibration({ ...input, provisional: false }, { model, authority: modelAuthority() }), { valid: false, reason: "invalid-candidate" });
  assert.deepEqual(applyPredictorCalibration(structuredClone(input), { model, authority: modelAuthority() }), { valid: false, reason: "invalid-candidate" });
  assert.deepEqual(applyPredictorCalibration(input, { model: modelVersion({ model: "different-model" }), authority: modelAuthority() }), { valid: false, reason: "invalid-candidate" });
  assert.deepEqual(applyPredictorCalibration(input, { model, authority: modelAuthority({ verifyModel: () => false }) }), { valid: false, reason: "not-authorized" });
  assert.deepEqual(applyPredictorCalibration(input, { ...options(model), transform: { transform: () => ({}) } }), { valid: false, reason: "unverified-calibration" });
});
test("a transform cannot release evaluated output after its artifact or evaluation permission is revoked", () => {
  const model = evaluatedModel(), input = predictorAcceptedOutput(predictorSnapshot(), model); let permitted = true;
  const configuration = options(model, (_family, probabilities) => { permitted = false; return probabilities; }, {
    authority: modelAuthority({ verifyCalibration: () => permitted }) });
  assert.deepEqual(applyPredictorCalibration(input, configuration), { valid: false, reason: "unverified-calibration" });
  permitted = true;
  assert.deepEqual(applyPredictorCalibration(input, options(model, (_family, probabilities) => { permitted = false; return probabilities; }, {
    authority: modelAuthority({ verifyEvaluation: () => permitted }) })), { valid: false, reason: "unverified-evaluation" });
});
test("calibration rechecks original source and transport permissions after local callbacks", () => {
  const model = evaluatedModel(), snapshot = predictorSnapshot(); let permitted = true;
  for (const permission of ["source", "transport"]) {
    permitted = true;
    const outputOptions = predictorOutputOptions(snapshot, model), authority = { ...outputOptions.authority,
      evidenceAuthority: evidenceAuthority({ verifyReuse: () => permission !== "source" || permitted }),
      verifyTransport: () => permission !== "transport" || permitted };
    const validated = validatePredictorOutput(predictorRawOutput(snapshot, model), { ...outputOptions, authority });
    assert.equal(validated.valid, true);
    assert.deepEqual(applyPredictorCalibration(validated.output, options(model, (_family, probabilities) => { permitted = false; return probabilities; })),
      { valid: false, reason: "not-authorized" });
  }
});
