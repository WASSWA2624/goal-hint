import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiBinding, OpenAiTransportError, openAiTransportRules } from "../src/server/predictor/openai-transport.ts";
import { parseCostUsage } from "../src/server/cost-control/cost-input.ts";
import { modelVersion, predictorHash } from "./helpers/predictor-fixtures.mjs";
import { predictorHarness } from "./helpers/predictor-service-fixtures.mjs";
import { costRate, USD } from "./helpers/cost-fixtures.mjs";

const options = { model: { provider: "openai", model: "gpt-6.1-sol", providerModelVersion: "gpt-6.1-sol",
  contractVersion: "openai-responses-v1", bounds: { maxInputBytes: 64_000, maxOutputBytes: 32_000 } } };
const maximum = { requests: 1, inputTokens: 70_000, outputTokens: 2_000, billedUnits: 70_000 };
async function fixture(fetcher, changes = {}) {
  const h = await predictorHarness(options);
  const permit = { attemptId: h.request.attemptId, jobId: h.job.jobId, periodId: h.period.periodId,
    ownerToken: predictorHash("synthetic-owner"), reservedAt: h.clock.value, launchBefore: h.clock.value + 1000, maximumCostUsdPicos: 1n };
  const input = { model: h.model, pin: h.pin, snapshot: h.snapshot, prompt: h.prompt, credential: "synthetic-ai-only-key",
    transport: { signal: new AbortController().signal, permit, maximum, timeoutMs: 1000 }, ...changes };
  const transport = createOpenAiBinding({ model: h.model, clock: h.clock, fetcher });
  const attempt = { request: { ...h.request, maximum }, periodId: permit.periodId, ownerToken: permit.ownerToken };
  return { ...h, transport, generate: () => transport.binding.generate(input), input, permit, attempt };
}
function rawResponse(h, changes = {}) {
  return { id: "resp_synthetic", object: "response", model: "gpt-6.1-sol", status: "completed", created_at: h.clock.value / 1000,
    error: null, incomplete_details: null, service_tier: "default", store: false,
    output: [{ id: "msg_synthetic", type: "message", status: "completed", role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(h.raw), annotations: [] }] }],
    usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100,
      input_tokens_details: { cached_tokens: 400, cache_write_tokens: 200 }, output_tokens_details: { reasoning_tokens: 60 } }, ...changes };
}
function response(body, headers = {}, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status,
    headers: { "content-type": "application/json", "x-request-id": "req_synthetic", ...headers } });
}
const sanitized = (error) => error instanceof OpenAiTransportError &&
  !String(error).includes("synthetic-ai-only-key") && !String(error).includes("private-provider-content");

test("one bounded Responses POST uses the pinned strict schema without tools, storage or retries", async () => {
  const calls = []; let h;
  h = await fixture(async (url, request) => { calls.push({ url, request }); return response(rawResponse(h)); });
  const result = await h.generate(), { url, request } = calls[0], body = JSON.parse(request.body);
  assert.equal(calls.length, 1); assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(request.method, "POST"); assert.equal(request.redirect, "error"); assert.equal(request.credentials, "omit");
  assert.equal(request.headers.authorization, "Bearer synthetic-ai-only-key");
  assert.equal(body.model, h.model.model); assert.equal(body.instructions, h.prompt.instructions); assert.equal(body.input, h.prompt.inputJson);
  assert.deepEqual(body.text.format, { type: "json_schema", name: "goal_hint_prediction", strict: true, schema: h.prompt.schema });
  assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, "none"); assert.equal(body.store, false);
  assert.equal(body.stream, false); assert.equal(body.background, false); assert.equal(body.service_tier, "default");
  assert.equal(body.reasoning.effort, "low"); assert.equal(body.max_output_tokens, maximum.outputTokens);
  assert.equal(body.truncation, "disabled"); assert.deepEqual(result.value.output, h.raw);
  assert.equal(Object.isFrozen(result.value.metadata), true);
});

test("exact receipt accounting separates ordinary, cached and cache-write input and includes reasoning output", async () => {
  let h; h = await fixture(async () => response(rawResponse(h)));
  const result = await h.generate();
  assert.deepEqual(result.usage.observedQuantities, { requests: 1, inputTokens: 1000, outputTokens: 100, billedUnits: 200 });
  assert.equal(result.usage.observedUsdPicos, 2_340_000_000n); assert.equal(result.usage.kind, "complete");
  assert.equal(result.usage.invoicedUsdPicos, null); assert.equal(result.usage.observedAt, h.clock.value);
  assert.equal(h.transport.verifyUsage(parseCostUsage(structuredClone(result.usage)), h.attempt), true);
  assert.equal(h.transport.verifyUsage({ ...result.usage, observedUsdPicos: 0n }, h.attempt), false);
  assert.equal(h.transport.verifyUsage(result.usage, { ...h.attempt, request: { ...h.attempt.request, attemptId: predictorHash("forged") } }), false);
  assert.equal(h.transport.verifyUsage(result.usage, { ...h.attempt, ownerToken: predictorHash("forged") }), false);
  const unobserved = createOpenAiBinding({ model: h.model, clock: h.clock, fetcher: async () => { throw new Error(); } });
  assert.equal(unobserved.verifyUsage(result.usage, h.attempt), false);
});

test("request creation is never generation; optional actual completion remains distinct from receipt", async () => {
  let h; h = await fixture(async () => {
    const raw = rawResponse(h, { completed_at: h.clock.value / 1000 + 1 }); h.clock.value += 2000; return response(raw);
  });
  const result = await h.generate();
  assert.equal(result.value.metadata.generatedAt, h.clock.value - 1000);
  assert.equal(result.value.metadata.retrievedAt, h.clock.value); assert.equal(result.value.metadata.providerUpdatedAt, null);
  assert.equal(h.transport.verifyTransport(structuredClone(result.value.metadata), h.model, h.snapshot), true);
  assert.equal(h.transport.verifyTransport({ ...result.value.metadata, generatedAt: h.clock.value }, h.model, h.snapshot), false);
  assert.equal(h.transport.verifyTransport(result.value.metadata, h.model, { ...h.snapshot, hash: predictorHash("forged") }), false);
  let other; other = await fixture(async () => response(rawResponse(other)));
  assert.equal((await other.generate()).value.metadata.generatedAt, null);
});

test("unreviewed models, copied prompts, credentials and insufficient reserved bounds never fetch", async () => {
  assert.throws(() => createOpenAiBinding({ model: modelVersion() }), sanitized);
  for (const override of [{ model: "gpt-6-sol" }, { providerModelVersion: "gpt-6.1-sol-unreviewed" }, { contractVersion: "other-api" }])
    assert.throws(() => createOpenAiBinding({ model: modelVersion({ ...options.model, ...override }) }), sanitized);
  let calls = 0; const h = await fixture(async () => { calls++; throw new Error(); });
  for (const changed of [{ credential: "synthetic\nkey" }, { prompt: { ...h.prompt } },
    { transport: { ...h.input.transport, maximum: { ...maximum, inputTokens: 1 } } },
    { transport: { ...h.input.transport, maximum: { ...maximum, billedUnits: 0 } } },
    { transport: { ...h.input.transport, maximum: { ...maximum, outputTokens: openAiTransportRules.maximumOutputTokens + 1 } } },
    { transport: { ...h.input.transport, maximum: { ...maximum, inputTokens: openAiTransportRules.shortContextTokens } } }])
    await assert.rejects(() => h.transport.binding.generate({ ...h.input, ...changed }), sanitized);
  assert.equal(calls, 0);
});

test("model/tier drift, bad clocks and unexpected tools fail without authenticating a receipt", async () => {
  let h, change;
  h = await fixture(async () => response(rawResponse(h, change)));
  for (change of [{ model: "another-model" }, { service_tier: "priority" },
    { store: true }, { created_at: h.clock.value / 1000 + 10 }, { completed_at: h.clock.value / 1000 + 10 },
    { output: [{ type: "function_call", name: "unexpected" }] }])
    await assert.rejects(() => h.generate(), sanitized);
});

test("refusals, incomplete and invalid output retain authenticated measured receipts for fallback", async () => {
  let h, change; h = await fixture(async () => response(rawResponse(h, change)));
  for (change of [{ status: "incomplete" }, { status: "failed", error: { message: "private-provider-content" } },
    { incomplete_details: { reason: "max_output_tokens" } },
    { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private-provider-content" }] }] },
    { output: [{ type: "message", role: "assistant", status: "completed", content: [
      { type: "output_text", text: "{}" }, { type: "output_text", text: "{}" }] }] },
    { output: [{ type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: "{}" }] }] },
    { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "invalid json" }] }] }]) {
    const received = await h.generate();
    assert.equal(received.value.output, null); assert.equal(received.usage.kind, "complete");
    assert.equal(received.usage.observedUsdPicos, 2_340_000_000n);
    assert.equal(h.transport.verifyUsage(received.usage, h.attempt), true);
    assert.equal(JSON.stringify(received.value).includes("private-provider-content"), false);
  }
});

test("the real gateway reconciles measured refusal usage before the predictor returns a fallback denial", async () => {
  let transport;
  const h = await predictorHarness({ model: { ...options.model, outputTiming: { basis: "retrieved" } },
    settings: { GOAL_HINT_JOB_TOKEN_LIMIT: "72000" },
    allocation: { ai: { costCapUsdPicos: 5n * USD, requestLimit: 2, inputTokenLimit: 70_000,
      outputTokenLimit: 2000, billedUnitLimit: 70_000, primaryTimeLimitMs: 25_000 } },
    job: { inputTokenLimit: 70_000, outputTokenLimit: 2000, billedUnitLimit: 70_000 }, request: { maximum },
    rateFor: () => costRate("ai", { provider: "openai", model: "gpt-6.1-sol", rates: {
      requests: { amount: "0", perUnits: 1 }, inputTokens: { amount: "2", perUnits: 1_000_000 },
      outputTokens: { amount: "10", perUnits: 1_000_000 }, billedUnits: { amount: "0.5", perUnits: 1_000_000 } } }),
    costAuthority: { verifyUsage: (usage, attempt) => transport.verifyUsage(usage, attempt) },
    verifyTransport: (...args) => transport.verifyTransport(...args), generate: (input) => transport.binding.generate(input) });
  transport = createOpenAiBinding({ model: h.model, clock: h.clock, fetcher: async () => response(rawResponse(h, {
    output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private-provider-content" }] }] })) });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.status, "denied"); assert.equal(result.reason, "invalid-output");
  assert.equal(result.requestsDispatched, 1); assert.equal(result.requestCountUnknown, false);
  const summary = await h.costService.summary(h.period.periodId);
  assert.equal(summary.observedUsdPicos, 2_340_000_000n);
  assert.equal(summary.requests, 1n); assert.equal(summary.inputTokens, 1000n); assert.equal(summary.outputTokens, 100n);
  assert.equal(summary.billedUnits, 200n); assert.equal(h.calls.length, 1);
  assert.equal(JSON.stringify(result).includes("private-provider-content"), false);
});

test("missing or incoherent usage never fabricates a successful accounting receipt", async () => {
  let h, usage; h = await fixture(async () => response(rawResponse(h, { usage })));
  const base = rawResponse(h).usage;
  for (usage of [null, { ...base, input_tokens_details: { cached_tokens: 0 } }, { ...base, total_tokens: 1 },
    { ...base, input_tokens_details: { cached_tokens: 900, cache_write_tokens: 200 } },
    { ...base, output_tokens_details: { reasoning_tokens: 101 } }, { ...base, output_tokens: maximum.outputTokens + 1,
      total_tokens: base.input_tokens + maximum.outputTokens + 1 }, { ...base, input_tokens: -1 },
    { ...base, input_tokens: 1.5 }]) await assert.rejects(() => h.generate(), sanitized);
});

test("HTTP/redirect/content errors and private thrown causes stay sanitized", async () => {
  const h = await fixture(async () => { throw new Error("private-provider-content synthetic-ai-only-key"); });
  await assert.rejects(() => h.generate(), sanitized);
  for (const make of [() => response("private-provider-content", {}, 429), () => response("private-provider-content", {}, 401),
    () => response("{}", { "content-type": "text/html" }), () => response("private-provider-content"),
    () => response("{}", { "x-request-id": "unsafe request id" }), () => response("{}", { "content-length": "20000000" }),
    () => response("{}", {}, 302)]) {
    const rejected = await fixture(async () => make()); await assert.rejects(() => rejected.generate(), sanitized);
  }
});

test("streamed oversized bodies and decoded output are bounded before acceptance", async () => {
  const large = await fixture(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(250_000)); controller.close();
  } }), { headers: { "content-type": "application/json", "x-request-id": "req_synthetic" } }));
  await assert.rejects(() => large.generate(), sanitized);
  let h; h = await fixture(async () => response(rawResponse(h, { output: [{ type: "message", status: "completed", role: "assistant",
    content: [{ type: "output_text", text: JSON.stringify({ text: "x".repeat(33_000) }) }] }] })));
  assert.equal((await h.generate()).value.output, null);
});

test("pre-abort and abort during a stalled body perform no retry and leave no accepted proof", async () => {
  let calls = 0; const h = await fixture(async () => { calls++; throw new Error(); });
  const stopped = new AbortController(); stopped.abort(new Error("private-provider-content"));
  await assert.rejects(() => h.transport.binding.generate({ ...h.input, transport: { ...h.input.transport, signal: stopped.signal } }), sanitized);
  assert.equal(calls, 0);
  const controller = new AbortController(); let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const stalled = await fixture(async () => { calls++; started(); return new Response(new ReadableStream(), {
    headers: { "content-type": "application/json", "x-request-id": "req_synthetic" } }); },
  { transport: { ...h.input.transport, signal: controller.signal } });
  const pending = stalled.generate(); await entered; controller.abort(); await assert.rejects(() => pending, sanitized);
  assert.equal(calls, 1);
});

test("transport timeout aborts a stalled response without exposing provider data", async () => {
  let h; h = await fixture(async () => new Response(new ReadableStream(), {
    headers: { "content-type": "application/json", "x-request-id": "req_synthetic" } }));
  await assert.rejects(() => h.transport.binding.generate({ ...h.input, transport: { ...h.input.transport, timeoutMs: 30 } }), sanitized);
});
