import assert from "node:assert/strict";
import test from "node:test";
import { SCORE_DISTRIBUTION_VERSION } from "../src/domain/score-distribution.ts";
import { buildPredictorPrompt, SCORE_PROMPT_VERSION, SCORE_SCHEMA_VERSION } from "../src/server/predictor/predictor-prompt.ts";
import { isPredictorOutputCurrent, validatePredictorOutput } from "../src/server/predictor/predictor-output.ts";
import { applyPredictorCalibration } from "../src/server/predictor/predictor-calibration.ts";
import { parseFallbackAiResult } from "../src/server/fallback/fallback-input.ts";
import { createModelPin } from "../src/server/predictor/predictor-input.ts";
import { predictorHash } from "./helpers/predictor-fixtures.mjs";
import { evidenceAuthority } from "./helpers/evidence-fixtures.mjs";
import { modelAuthority, modelVersion } from "./helpers/predictor-fixtures.mjs";
import { predictorOutputOptions, predictorRawOutput, predictorSnapshot } from "./helpers/predictor-output-fixtures.mjs";

const model = (overrides = {}) => modelVersion({ promptVersion: SCORE_PROMPT_VERSION, schemaVersion: SCORE_SCHEMA_VERSION, ...overrides });
const scoreDistribution = () => ({ version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
  { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .1 },
  { home: 1, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
  { home: 2, away: 1, halfHome: 1, halfAway: 0, probability: .3 },
  { home: 0, away: 2, halfHome: 0, halfAway: 1, probability: .4 },
] });
function setup(selected = model()) {
  const snapshot = predictorSnapshot(), options = predictorOutputOptions(snapshot, selected);
  const { groups: _groups, ...base } = predictorRawOutput(snapshot, selected); void _groups;
  return { snapshot, model: selected, options, raw: { ...base, scoreDistribution: scoreDistribution() } };
}

test("v2 prompt requests one bounded joint distribution under the existing pinned identity and input-byte budget", () => {
  const fixture = setup(), authority = { evidence: evidenceAuthority(), verifyModel: () => true, verifyTransmission: () => true };
  const prompt = buildPredictorPrompt({ snapshot: fixture.snapshot, model: fixture.model, authority });
  assert.equal(prompt.promptVersion, SCORE_PROMPT_VERSION); assert.equal(prompt.schemaVersion, SCORE_SCHEMA_VERSION);
  assert.ok(Object.hasOwn(prompt.schema.properties, "scoreDistribution"));
  assert.equal(Object.hasOwn(prompt.schema.properties, "groups"), false);
  assert.match(prompt.instructions, /joint regulation full-time and half-time score distribution/u);
  assert.match(prompt.instructions, /Retain unsupported tail mass explicitly/u);
  assert.ok(prompt.bytes <= fixture.model.bounds.maxInputBytes);
  assert.throws(() => buildPredictorPrompt({ snapshot: fixture.snapshot,
    model: model({ bounds: { maxInputBytes: prompt.bytes - 1 } }), authority }));
});

test("v2 validates the same evidence/transport/citations and derives legacy families without independent model groups", () => {
  const fixture = setup(), checked = validatePredictorOutput(fixture.raw, fixture.options);
  assert.equal(checked.valid, true, checked.reason);
  assert.equal(checked.output.markets.markets["match-result"].market.selectedProbability, .5);
  assert.equal(checked.output.markets.markets["total-goals"].market.selection, "under-2.5");
  assert.equal(checked.output.markets.markets["both-teams-to-score"].market.selection, "no");
  assert.equal(checked.output.scoreDistribution.states.length, 4);
  assert.ok(Object.isFrozen(checked.output.scoreDistribution.states[0]));
  assert.equal(isPredictorOutputCurrent(checked.output, fixture.model, fixture.options.now), true);
  const calibrated = applyPredictorCalibration(checked.output, { model: fixture.model, authority: modelAuthority() });
  assert.equal(calibrated.valid, true);
  assert.equal(calibrated.output.scoreDistribution, checked.output.scoreDistribution);
  assert.equal(calibrated.output.provisional, true);
});

test("score output cannot add independent groups, alter identity, hide unknown tail, or bypass output-byte limits", () => {
  const fixture = setup();
  for (const raw of [{ ...fixture.raw, groups: {} }, { ...fixture.raw, scoreDistribution: { ...scoreDistribution(), unrepresentedProbability: .1 } }]) {
    assert.deepEqual(validatePredictorOutput(raw, fixture.options), { valid: false, reason: "invalid-output" });
  }
  assert.deepEqual(validatePredictorOutput({ ...fixture.raw, fixtureVersion: "2" }, fixture.options), { valid: false, reason: "wrong-identity" });
  const tooSmall = setup(model({ bounds: { maxOutputBytes: 100 } }));
  assert.deepEqual(validatePredictorOutput(tooSmall.raw, tooSmall.options), { valid: false, reason: "invalid-output" });
  const tail = scoreDistribution(); tail.states[0].probability = .05; tail.unrepresentedProbability = .05;
  const checked = validatePredictorOutput({ ...fixture.raw, scoreDistribution: tail }, fixture.options);
  assert.equal(checked.valid, true);
  assert.equal(checked.output.scoreDistribution.unrepresentedProbability, .05);
  assert.ok(Object.values(checked.output.markets.markets).every((entry) => !entry.available));
});

test("legacy v1 output cannot smuggle a score extension and unsupported calibration cannot transform v2 marginal groups", () => {
  const legacyModel = modelVersion(), snapshot = predictorSnapshot(), options = predictorOutputOptions(snapshot, legacyModel);
  const raw = { ...predictorRawOutput(snapshot, legacyModel), scoreDistribution: scoreDistribution() };
  assert.deepEqual(validatePredictorOutput(raw, options), { valid: false, reason: "invalid-output" });
  const v2 = setup(model({ calibration: { kind: "evaluated", version: "synthetic-score-calibration", method: "synthetic-transform",
    parameters: {}, sourceFamilies: ["match-result"], evidenceRef: "synthetic-proof", evaluationRef: "synthetic-artifact" },
    windows: { calibration: { startsAt: 1_000_000_000_000, endsAt: 1_000_000_001_000 } } }));
  assert.deepEqual(validatePredictorOutput(v2.raw, v2.options), { valid: false, reason: "invalid-output" });
});

test("the durable fallback parser retains the v2 distribution while rejecting substituted legacy marginal probabilities", () => {
  const fixture = setup(), checked = validatePredictorOutput(fixture.raw, fixture.options);
  assert.equal(checked.valid, true);
  const calibrated = applyPredictorCalibration(checked.output, { model: fixture.model, authority: modelAuthority() });
  assert.equal(calibrated.valid, true);
  const candidate = { status: "candidate", requestsDispatched: 1, requestCountUnknown: false, output: calibrated.output,
    pin: createModelPin({ version: 1, modelVersionId: fixture.model.id,
      jobId: predictorHash("synthetic-score-job"), invocationId: predictorHash("synthetic-score-invocation") }) };
  assert.equal(parseFallbackAiResult(candidate), candidate);
  const tampered = structuredClone(candidate);
  tampered.output.markets.markets["total-goals"].market.selectedProbability -= .1;
  assert.throws(() => parseFallbackAiResult(tampered));
  const legacyVersion = structuredClone(candidate); legacyVersion.output.schemaVersion = "regulation-ai-output-v1";
  assert.throws(() => parseFallbackAiResult(legacyVersion));
});
