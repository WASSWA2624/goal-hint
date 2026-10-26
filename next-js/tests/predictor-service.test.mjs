import assert from "node:assert/strict";
import test from "node:test";
import { createPredictorService } from "../src/server/predictor/predictor-service.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { predictorSnapshot } from "./helpers/predictor-output-fixtures.mjs";
import { predictorHarness } from "./helpers/predictor-service-fixtures.mjs";
import { COST_NOW, costId } from "./helpers/cost-fixtures.mjs";
import { evidenceContext, evidenceSource } from "./helpers/evidence-fixtures.mjs";

// The full local chain uses synthetic approvals, rates, facts and receipts.
// It makes no network calls and establishes no predictive quality.
test("the real predictor chain returns a pinned provisional candidate with original evidence and clocks", async () => {
  const h = await predictorHarness({ context: { analysisAt: COST_NOW - 2000, cutoffAt: COST_NOW - 2000 } });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.status, "candidate"); assert.equal(h.calls.length, 1);
  assert.deepEqual(result.pin, h.pin);
  assert.equal(result.output.modelVersionId, h.model.id); assert.equal(result.output.evidenceHash, h.snapshot.hash);
  assert.deepEqual(result.output.context, h.snapshot.context);
  assert.deepEqual(result.output.timestamps, h.metadata);
  assert.deepEqual(result.output.evidence.coverage, h.snapshot.coverage);
  assert.deepEqual(result.output.evidence.missingness, h.snapshot.missingness);
  assert.equal(result.output.provisional, true); assert.equal(result.output.calibration.kind, "none");
  assert.equal(result.output.markets.markets["double-chance"].available, true);
  assert.equal(result.output.sources[0].retrievedAt, h.snapshot.sources[0].retrievedAt);
  assert.equal(result.output.timestamps.generatedAt > h.snapshot.context.cutoffAt, true);
  assert.equal(Object.isFrozen(result.output.evidence.missingness), true);
  assert.equal(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value).includes("synthetic-only-key"), false);
});

test("invalid families retain shared failure reasons while independent valid families survive", async () => {
  const h = await predictorHarness({ generate: async (_input, response) => ({ ...response, value: { ...response.value,
    output: { ...response.value.output, groups: { ...response.value.output.groups,
      "total-goals": { period: "regulation-including-stoppage-time", line: 2.5, probabilities: { "over-2.5": 0.6 } } } } } }) });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.status, "candidate");
  assert.equal(result.output.markets.markets["match-result"].available, true);
  assert.equal(result.output.markets.markets["total-goals"].available, false);
  assert.equal(result.output.markets.markets["both-teams-to-score"].available, true);
  assert.equal(result.output.markets.issues.length > 0, true);
});

test("all invalid families produce invalid-output and structured market issues after one accounted attempt", async () => {
  const h = await predictorHarness({ generate: async (_input, response) => ({ ...response, value: { ...response.value,
    output: { ...response.value.output, groups: { "match-result": null, "total-goals": null, "both-teams-to-score": null } } } }) });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.reason, "invalid-output"); assert.equal(result.requestsDispatched, 1);
  assert.equal(result.markets.markets["match-result"].available, false); assert.equal(h.calls.length, 1);
});

test("wrong identity and fabricated citations deny the entire response without a paid retry", async () => {
  for (const [reason, change] of [["wrong-identity", (output) => ({ ...output, externalFixtureId: 999 })],
    ["invalid-citation", (output) => ({ ...output, reasons: output.reasons.map((item) => ({ ...item,
      references: item.references.map((reference) => ({ ...reference, sourceId: costId("invented-source") })) })) })]]) {
    const h = await predictorHarness({ generate: async (_input, response) => ({ ...response,
      value: { ...response.value, output: change(response.value.output) } }) });
    assert.equal((await h.predictor.predict(h.input)).reason, reason);
    assert.equal(h.calls.length, 1);
    assert.equal((await h.predictor.predict(h.input)).status, "denied"); assert.equal(h.calls.length, 1);
    assert.equal((await h.costService.summary(h.period.periodId)).requests, 1n);
  }
});

test("insufficient evidence, budget exhaustion, malformed output and timeout are distinct", async () => {
  const insufficient = await predictorHarness();
  const snapshot = predictorSnapshot([], insufficient.snapshot.policy, insufficient.snapshot.context);
  assert.equal((await insufficient.predictor.predict({ ...insufficient.input, snapshot })).reason, "insufficient-evidence");
  assert.equal(insufficient.calls.length, 0);
  const exhausted = await predictorHarness({ period: { openingChargedUsdPicos: 20_000_000_000_000n } });
  assert.equal((await exhausted.predictor.predict(exhausted.input)).reason, "budget-exhausted"); assert.equal(exhausted.calls.length, 0);
  const malformed = await predictorHarness({ generate: async (_input, response) => ({ ...response,
    value: { ...response.value, output: "not JSON" } }) });
  assert.equal((await malformed.predictor.predict(malformed.input)).reason, "invalid-output");
  const timeout = await predictorHarness({ serviceOptions: { registry: { async resolve() { await new Promise((resolve) => setTimeout(resolve, 60));
    throw new Error("private registry diagnostic"); } } } });
  assert.equal((await timeout.predictor.predict({ ...timeout.input, maxElapsedMs: 10 })).reason, "timeout");
  await new Promise((resolve) => setTimeout(resolve, 70)); assert.equal(timeout.calls.length, 0);
});

test("concurrent identical calls join one attempt and conflicting evidence is rejected", async () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const h = await predictorHarness({ generate: async (_input, response) => { await ready; return response; } });
  const first = h.predictor.predict(h.input), joined = h.predictor.predict(h.input);
  assert.equal(first, joined);
  const changed = { ...h.input, maxElapsedMs: h.input.maxElapsedMs - 1 };
  assert.equal((await h.predictor.predict(changed)).reason, "conflicting-invocation");
  release(); assert.equal((await first).status, "candidate"); assert.equal(h.calls.length, 1);
});

test("wrong cost intent, asynchronous authority and revoked model permissions prevent dispatch", async () => {
  const h = await predictorHarness();
  assert.equal((await h.predictor.predict({ ...h.input, extra: "private" })).reason, "invalid-request");
  assert.equal((await h.predictor.predict({ ...h.input, request: { ...h.request, attemptId: costId("other-attempt") } })).reason, "invalid-request");
  h.permissions.model = false;
  assert.equal((await h.predictor.predict(h.input)).reason, "not-authorized"); assert.equal(h.calls.length, 0);
  const asynchronous = await predictorHarness({ verifyInvocation: async () => { throw new Error("private"); } });
  assert.equal((await asynchronous.predictor.predict(asynchronous.input)).reason, "not-authorized");
  assert.equal(asynchronous.calls.length, 0);
});

test("source and transmission rights revoked during generation cannot yield a candidate", async () => {
  for (const permission of ["evidence", "transmission", "calibration", "evaluation", "invocation"]) {
    let harness;
    harness = await predictorHarness({ generate: async (_input, response) => { harness.permissions[permission] = false; return response; } });
    const result = await harness.predictor.predict(harness.input);
    assert.equal(result.status, "denied"); assert.equal(result.requestsDispatched, 1); assert.equal(result.requestCountUnknown, false);
    assert.equal(harness.calls.length, 1);
  }
});

test("expired source retention and altered immutable evidence fail before paid dispatch", async () => {
  const h = await predictorHarness();
  const body = { ...h.snapshot, facts: h.snapshot.facts.map((fact) => ({ ...fact, flags: ["rumor"] })) };
  const { id: _id, hash: _hash, ...hashed } = body; void _id; void _hash;
  const hash = evidenceFingerprint(hashed);
  const changed = await h.predictor.predict({ ...h.input, snapshot: { ...body, id: hash, hash } });
  assert.equal(changed.status, "denied"); assert.equal(h.calls.length, 0);
  h.clock.value = h.snapshot.sources[0].reuse.retainUntil + 1;
  assert.equal((await h.predictor.predict(h.input)).status, "denied"); assert.equal(h.calls.length, 0);
});

test("future output clocks and absent semantic or transport proof reject output after accounting", async () => {
  for (const changes of [{ verifyTransport: () => false }, { verifyExplanation: () => false },
    { generate: async (input, response) => ({ ...response, value: { ...response.value,
      metadata: { ...response.value.metadata, generatedAt: input.snapshot.context.kickoffAt + 1 } } }) }]) {
    const h = await predictorHarness(changes), result = await h.predictor.predict(h.input);
    assert.equal(result.status, "denied"); assert.equal(result.requestsDispatched, 1); assert.equal(h.calls.length, 1);
  }
});

test("bounded service capacity never dispatches a second invocation while full", async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const h = await predictorHarness({ serviceOptions: { maxInflight: 1 }, generate: async (_input, response) => { await wait; return response; } });
  const pending = h.predictor.predict(h.input);
  const otherPin = await h.registry.pin({ jobId: h.pin.jobId, invocationId: costId("other-invocation"), modelVersionId: h.model.id });
  assert.equal((await h.predictor.predict({ ...h.input, pin: otherPin,
    request: { ...h.request, attemptId: otherPin.invocationId } })).reason, "capacity-exhausted");
  release(); await pending; assert.equal(h.calls.length, 1);
  assert.throws(() => createPredictorService({ maxInflight: 0 }));
});

test("blocking preflight cannot consume fallback time when the wall clock is fixed", async () => {
  const h = await predictorHarness({ job: { deadlineAt: COST_NOW + 5020 }, maxElapsedMs: 1000,
    verifyInvocation() { const until = performance.now() + 30; while (performance.now() < until) { /* Synchronous approval latency. */ } return true; } });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.reason, "timeout"); assert.equal(h.calls.length, 0);
});

test("source retention expiring during generation prevents use despite the original valid cutoff", async () => {
  const context = evidenceContext(undefined, { analysisAt: COST_NOW, cutoffAt: COST_NOW });
  let h;
  h = await predictorHarness({ context, sources: [evidenceSource(context, { reuse: { retainUntil: COST_NOW + 20 } })],
    generate: async (_input, response) => { h.clock.value = COST_NOW + 21; return response; } });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.status, "denied"); assert.equal(result.requestsDispatched, 1); assert.equal(result.requestCountUnknown, false);
  assert.equal(h.calls.length, 1);
});

test("output freshness is rechecked after semantic callbacks before returning the original timestamps", async () => {
  let h;
  h = await predictorHarness({ model: { outputTiming: { maxAgeMs: 5 } },
    verifyExplanation() { h.clock.value = COST_NOW + 6; return true; } });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.reason, "invalid-timing"); assert.equal(result.requestsDispatched, 1);
  assert.equal(h.calls.length, 1); assert.equal(h.metadata.generatedAt, COST_NOW);
});
