import assert from "node:assert/strict";
import test from "node:test";
import { createModelPin, createModelVersion, modelVersionHash, parseModelPin, parseModelVersion, PredictorInputError } from "../src/server/predictor/predictor-input.ts";
import { createModelRegistry, ModelRegistryError } from "../src/server/predictor/predictor-registry.ts";
import { modelAuthority, modelConfiguration, modelMemoryStore, modelVersion, predictorHash } from "./helpers/predictor-fixtures.mjs";

const denied = (reason) => (error) => error instanceof ModelRegistryError && error.reason === reason && !error.message.includes("private-synthetic-key");
const invalid = (error) => error instanceof PredictorInputError && !error.message.includes("private-synthetic-key");
function registry(options = {}) {
  const memory = modelMemoryStore();
  return { ...memory, registry: createModelRegistry({ store: memory.store, authority: modelAuthority(), maxPins: 20, ...options }) };
}
const pinInput = (model, invocation = "invocation", job = "job") => ({ invocationId: predictorHash(invocation), jobId: predictorHash(job), modelVersionId: model.id });
test("model configurations require explicit immutable versions, decisions and bounded limits", () => {
  const model = modelVersion(); assert.deepEqual(parseModelVersion(model), model); assert.ok(Object.isFrozen(model.bounds));
  const invalidChanges = [{ providerModelVersion: undefined }, { model: "private-synthetic-key\n" },
    { bounds: { maxInputBytes: Number.MAX_SAFE_INTEGER + 1 } }, { bounds: { maxReasonCharacters: 4097 } },
    { bounds: { maxCitationsPerItem: 0 } }, { outputTiming: { maxAgeMs: -1 } }, { credential: "private-synthetic-key" }];
  for (const change of invalidChanges) assert.throws(() => createModelVersion(modelConfiguration(change)), invalid);
  assert.throws(() => createModelVersion({ ...modelConfiguration(), outputTiming: undefined }), invalid);
  assert.throws(() => parseModelVersion({ ...model, promptVersion: "changed-upstream-version" }), invalid);
  assert.throws(() => { model.bounds.maxInputBytes++; }, TypeError);
});
test("chronological windows prevent overlap and out-of-order training, validation, calibration and final test", () => {
  const windows = { training: { startsAt: 0, endsAt: 100 }, validation: { startsAt: 100, endsAt: 200 },
    calibration: { startsAt: 200, endsAt: 300 }, finalTest: { startsAt: 300, endsAt: 400 } };
  assert.doesNotThrow(() => modelVersion({ windows }));
  for (const change of [{ validation: { startsAt: 99, endsAt: 200 } }, { finalTest: { startsAt: 250, endsAt: 400 } },
    { training: { startsAt: 100, endsAt: 100 } }, { training: { startsAt: 300, endsAt: 400 }, validation: null }])
    assert.throws(() => modelVersion({ windows: { ...windows, ...change } }), invalid);
  assert.doesNotThrow(() => modelVersion({ windows: { ...windows, validation: null } }));
});
test("evaluation and calibration claims require explicit artifact references, families and applicable window", () => {
  const calibration = { kind: "evaluated", version: "synthetic-cal-v1", method: "synthetic-method", parameters: { alpha: 1 },
    sourceFamilies: ["total-goals", "match-result"], evidenceRef: "synthetic-calibration-proof", evaluationRef: "synthetic-calibration-evaluation" };
  const windows = { calibration: { startsAt: 200, endsAt: 300 } };
  const model = modelVersion({ calibration, windows });
  assert.deepEqual(model.calibration.sourceFamilies, ["match-result", "total-goals"]);
  assert.throws(() => modelVersion({ calibration }), invalid);
  assert.throws(() => modelVersion({ calibration: { ...calibration, sourceFamilies: ["double-chance"] }, windows }), invalid);
  assert.throws(() => modelVersion({ calibration: { ...calibration, sourceFamilies: ["match-result", "match-result"] }, windows }), invalid);
  assert.throws(() => modelVersion({ calibration: { ...calibration, parameters: { alpha: Infinity } }, windows }), invalid);
  assert.throws(() => modelVersion({ evaluation: { version: "eval-v1", evidenceRef: "eval-proof", status: "evaluated", evaluationRef: null } }), invalid);
  assert.throws(() => modelVersion({ evaluation: { version: "eval-v1", evidenceRef: "eval-proof", status: "provisional", evaluationRef: "pretended-proof" } }), invalid);
});
test("equivalent canonical configurations have one identity and every material policy change produces another", () => {
  const configuration = modelConfiguration(), model = createModelVersion(configuration);
  const reversed = Object.fromEntries(Object.entries(configuration).reverse());
  assert.equal(createModelVersion(reversed).id, model.id); assert.equal(modelVersionHash(model), model.id);
  for (const change of [{ providerModelVersion: "synthetic-model-2026-01-02" }, { promptVersion: "prompt-v2" }, { schemaVersion: "schema-v2" },
    { outputTiming: { maxAgeMs: 2 } }, { bounds: { maxInputBytes: 1234 } }, { windows: { training: { startsAt: 0, endsAt: 100 } } }])
    assert.notEqual(modelVersion(change).id, model.id);
});
test("empty registry is unconfigured and does not invent a default production model", async () => {
  const { registry: service } = registry(); const model = modelVersion();
  assert.equal(await service.find(model.id), null);
  await assert.rejects(service.pin(pinInput(model)), denied("unconfigured"));
});
test("registry gates model, calibration and evaluation with exact synchronous authority and rechecks after storage", async () => {
  for (const overrides of [{ verifyModel: () => false }, { verifyCalibration: () => false }, { verifyEvaluation: () => false },
    { verifyModel: async () => true }, { authorize: async () => {} },
    { verifyModel: async () => { throw new Error("private-synthetic-key"); } },
    { authorize: async () => { throw new Error("private-synthetic-key"); } },
    { authorize() { throw new Error("private-synthetic-key"); } }]) {
    const { registry: service, records } = registry({ authority: modelAuthority(overrides) });
    await assert.rejects(service.register(modelConfiguration()), denied("not-authorized")); assert.equal(records.size, 0);
  }
  let allowed = true; const memory = modelMemoryStore();
  const service = createModelRegistry({ authority: modelAuthority({ verifyModel: () => allowed }), maxPins: 20,
    store: { ...memory.store, async save(model) { allowed = false; return model; } } });
  await assert.rejects(service.register(modelConfiguration()), denied("not-authorized"));
});
test("one model identity remains pinned to a job through retries and distinct invocation IDs", async () => {
  const { registry: service } = registry(); const first = await service.register(modelConfiguration()), second = await service.register(modelConfiguration({ promptVersion: "prompt-v2" }));
  const input = pinInput(first), pin = await service.pin(input);
  assert.deepEqual(await service.pin(input), pin); assert.equal((await service.resolve(pin)).model.id, first.id);
  assert.equal((await service.pin(pinInput(first, "retry"))).modelVersionId, first.id);
  await assert.rejects(service.pin(pinInput(second, "new-attempt")), denied("conflicting-pin"));
  await assert.rejects(service.pin(pinInput(second)), denied("conflicting-pin"));
  await assert.rejects(service.pin(pinInput(first, "invocation", "different-job")), denied("conflicting-pin"));
});
test("concurrent first pins cannot race to silently switch a shared job model", async () => {
  const { registry: service } = registry(); const first = await service.register(modelConfiguration()), second = await service.register(modelConfiguration({ promptVersion: "prompt-v2" }));
  const outcomes = await Promise.allSettled([service.pin(pinInput(first, "attempt-a")), service.pin(pinInput(second, "attempt-b"))]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = outcomes.find((result) => result.status === "rejected"); assert.equal(rejected.reason.reason, "conflicting-pin");
});
test("restored pins require independent previous-job proof and cannot change identity", async () => {
  const { registry: first, store } = registry(); const model = await first.register(modelConfiguration()), pin = await first.pin(pinInput(model));
  const blocked = createModelRegistry({ store, authority: modelAuthority(), maxPins: 20 });
  await assert.rejects(blocked.resolve(pin), denied("not-authorized"));
  const asynchronous = createModelRegistry({ store, authority: modelAuthority(), maxPins: 20,
    verifyPriorPin: async () => { throw new Error("private-synthetic-key"); } });
  await assert.rejects(asynchronous.resolve(pin), denied("not-authorized"));
  const restored = createModelRegistry({ store, authority: modelAuthority(), maxPins: 20, verifyPriorPin: (candidate) => candidate.id === pin.id });
  assert.equal((await restored.resolve(pin)).model.id, model.id);
  const second = await restored.register(modelConfiguration({ model: "different-synthetic-model" }));
  await assert.rejects(restored.pin({ ...pinInput(second, "retry"), priorPin: pin }), denied("conflicting-pin"));
  await assert.rejects(restored.pin({ ...pinInput(model, "retry", "changed-job"), priorPin: pin }), denied("conflicting-pin"));
  assert.throws(() => parseModelPin({ ...pin, jobId: predictorHash("changed") }), invalid);
});
test("bounded registry never evicts an old pin and silently permits a later switch", async () => {
  const { registry: service } = registry({ maxPins: 1 }); const model = await service.register(modelConfiguration());
  await service.pin(pinInput(model)); await assert.rejects(service.pin(pinInput(model, "next-job", "next-job")), denied("capacity-exhausted"));
  assert.equal((await service.pin(pinInput(model))).modelVersionId, model.id);
  const pin = createModelPin({ version: 1, ...pinInput(model) }); assert.ok(Object.isFrozen(pin));
});
test("corrupted storage, forged configuration and private failures fail closed", async () => {
  const model = modelVersion();
  const corrupt = createModelRegistry({ maxPins: 20, authority: modelAuthority(), store: { async save() { return model; }, async find() { return { ...model, provider: "forged" }; } } });
  await assert.rejects(corrupt.find(model.id), denied("unavailable"));
  const unavailable = createModelRegistry({ maxPins: 20, authority: modelAuthority(), store: { async save() { throw new Error("private-synthetic-key"); }, async find() { throw new Error("private-synthetic-key"); } } });
  await assert.rejects(unavailable.find(model.id), denied("unavailable")); await assert.rejects(unavailable.register(modelConfiguration()), denied("unavailable"));
});
