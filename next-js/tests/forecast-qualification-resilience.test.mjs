import assert from "node:assert/strict";
import test from "node:test";
import { marketRules, validateMarketSnapshot } from "../src/domain/markets.ts";
import { SCORE_DISTRIBUTION_VERSION } from "../src/domain/score-distribution.ts";
import { legacyMarketsFromScoreDistribution } from "../src/domain/score-distribution-legacy.ts";
import { LIVE_FORECAST_CASCADE, QUALIFIED_FORECAST_CASCADE } from "../src/server/fallback/fallback-contract.ts";
import { parseFallbackAiResult, parseResolvedForecastCandidate } from "../src/server/fallback/fallback-input.ts";
import { resolveFallbackCandidate } from "../src/server/fallback/fallback-resolution.ts";
import { OpenAiTransportError } from "../src/server/predictor/openai-transport.ts";
import { SCORE_SCHEMA_VERSION } from "../src/server/predictor/predictor-prompt.ts";
import { createPredictorCircuitBreaker, predictorResilience, predictorRetryRequest } from "../src/server/predictor/predictor-resilience.ts";
import { fallbackAiDenied, fallbackFixture, fallbackProvider } from "./helpers/fallback-fixtures.mjs";
import { fallbackServiceSetup } from "./helpers/fallback-service-fixtures.mjs";
import { evidenceHash } from "./helpers/evidence-fixtures.mjs";
import { predictorHarness } from "./helpers/predictor-service-fixtures.mjs";

test("qualified refresh skips provisional AI and unavailable numerical local support, then uses only mapped provider probabilities", async () => {
  let localCalls = 0;
  const h = fallbackServiceSetup({ service: { async localEngine() { localCalls++; throw new Error("unqualified fitter ran"); } } });
  const request = h.request({ sourceCascade: QUALIFIED_FORECAST_CASCADE, order: "ai-first",
    bounds: { ...h.request().bounds, deadlineAt: h.clock.now() + 5000 }, maxElapsedMs: 5000 });
  const result = await h.service.resolve(request);
  assert.equal(result.status, "candidate", result.reason);
  assert.equal(localCalls, 0);
  assert.equal(result.candidate.markets["match-result"].market.source, "api-football");
  assert.equal(result.candidate.markets["double-chance"].market.source, "api-football");
  assert.deepEqual(result.candidate.audit.transitions["match-result"], {
    selected: "api-football", ai: "unqualified-numerical-output", local: "unqualified-local-model", provider: "selected",
  });
  assert.deepEqual(result.candidate.audit.transitions["double-chance"], result.candidate.audit.transitions["match-result"]);
  assert.equal(result.candidate.audit.transitions["total-goals"].provider, "unsupported-family");
  assert.equal(result.candidate.markets["both-teams-to-score"].available, false);
  assert.equal(result.sources.ai.reason, "unqualified-numerical-output");
  assert.equal(h.collected.length, 1);
  assert.equal(result.requestsDispatched, 1);
});

const candidateMarket = (probabilities, source, line) =>
  ({ source, period: marketRules.period, probabilities, ...(line === undefined ? {} : { line }) });

function localCandidate({ expected, ai, now }) {
  const snapshot = validateMarketSnapshot({
    "total-goals": candidateMarket({ "over-2.5": .8, "under-2.5": .2 }, "local-engine", 2.5),
    "both-teams-to-score": candidateMarket({ yes: .1, no: .9 }, "local-engine"),
  });
  const markets = Object.fromEntries(Object.entries(snapshot.markets).map(([family, item]) =>
    [family, item.available ? { ...item, fallback: null, timestamps: { generatedAt: now, retrievedAt: now, providerUpdatedAt: null },
      flags: ["unknown-provider-update-time"], provenance: { kind: "local-engine", evidenceHash: expected.evidenceHash,
        modelVersion: "synthetic-qualified-local-fit", historyHash: evidenceHash("synthetic-fit"), rates: { home: 1.5, away: .8 },
        sample: { matches: 200, homeEffectiveMatches: 30, awayEffectiveMatches: 30 } } } : item]));
  return { context: expected, markets, reasons: [{ text: "Historical estimates.", sourceUrls: [] },
    { text: "Synthetic only.", sourceUrls: [] }], uncertainty: { text: "Synthetic fixture.", sourceUrls: [] }, issues: snapshot.issues,
  audit: { aiStatus: ai.status, aiReason: ai.reason, sourceCascade: LIVE_FORECAST_CASCADE,
    localStatus: "candidate", providerStatus: "not-requested", providerReason: null } };
}

test("qualified resolution preserves independent local families, reconciles compatible provider 1X2 and abstains on conflicting replacements", () => {
  const h = fallbackFixture(), expected = { ...h.expected, pin: null }, ai = fallbackAiDenied("provider-circuit-open");
  const local = localCandidate({ expected, ai, now: h.now });
  const qualification = { verifyLocalNumericalBasis: (value, current, family) =>
    value === local && current.jobId === expected.jobId && family !== "match-result" };
  const input = { expected, ai, local, now: h.now, qualification };
  const compatible = resolveFallbackCandidate({ ...input, provider: fallbackProvider(expected) }, h.authority);
  assert.equal(compatible.status, "candidate", compatible.reason);
  assert.equal(compatible.candidate.markets["match-result"].market.source, "api-football");
  assert.equal(compatible.candidate.markets["total-goals"].provenance.numericalBasis, "qualified-local-model");
  assert.equal(compatible.candidate.markets["both-teams-to-score"].market.source, "local-engine");
  assert.deepEqual(parseResolvedForecastCandidate(compatible.candidate), compatible.candidate);
  const conflicting = resolveFallbackCandidate({ ...input, provider: fallbackProvider(expected, { groups: {
    "match-result": candidateMarket({ "home-win": .05, draw: .9, "away-win": .05 }, "api-football"),
  } }) }, h.authority);
  assert.equal(conflicting.status, "candidate", conflicting.reason);
  assert.deepEqual(conflicting.candidate.markets["match-result"], { available: false, reason: "cross-market-conflict" });
  assert.equal(conflicting.candidate.audit.transitions["double-chance"].provider, "cross-market-conflict");
  assert.equal(conflicting.candidate.markets["total-goals"].available, true);
  assert.equal(conflicting.candidate.markets["both-teams-to-score"].available, true);
});

test("an evaluated joint replacement still requires independent numerical authority for each AI family", () => {
  const h = fallbackFixture();
  const distribution = { version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
    { home: 0, away: 0, halfHome: null, halfAway: null, probability: .1 },
    { home: 2, away: 1, halfHome: null, halfAway: null, probability: .45 },
    { home: 0, away: 2, halfHome: null, halfAway: null, probability: .45 },
  ] };
  const ai = { ...h.ai, output: { ...h.ai.output, schemaVersion: SCORE_SCHEMA_VERSION, provisional: false,
    evaluation: { ...h.ai.output.evaluation, status: "evaluated", evaluationRef: "synthetic-holdout" }, scoreDistribution: distribution,
    markets: legacyMarketsFromScoreDistribution(distribution) } };
  const result = resolveFallbackCandidate({ expected: h.expected, now: h.now, ai, provider: fallbackProvider(h.expected),
    qualification: { verifyAiNumericalBasis: (candidate, _, family) => candidate === ai && family !== "match-result" },
  }, h.authority);
  assert.equal(result.status, "candidate", result.reason);
  assert.equal(result.candidate.markets["match-result"].market.source, "api-football");
  assert.equal(result.candidate.markets["total-goals"].provenance.numericalBasis, "qualified-joint-score-distribution");
  assert.equal(result.candidate.markets["both-teams-to-score"].provenance.numericalBasis, "qualified-joint-score-distribution");
});

test("only a transient failure retries and both attempts use separate durable reservations bound to the original pin", async () => {
  let calls = 0;
  const h = await predictorHarness({ maxElapsedMs: 10_000, request: { timeoutMs: 2000 }, generate(input, response) {
    calls++;
    assert.ok(input.transport.timeoutMs <= predictorResilience.callTimeoutMs);
    if (calls === 1) throw new OpenAiTransportError("transient");
    assert.equal(input.transport.permit.attemptId, predictorRetryRequest(h.request).attemptId);
    assert.equal(input.pin.invocationId, h.request.attemptId);
    return response;
  } });
  const result = await h.predictor.predict(h.input);
  assert.equal(result.status, "candidate", result.reason);
  assert.equal(calls, 2);
  assert.equal(result.requestsDispatched, 2);
  assert.equal(result.attempts[0].reason, "transient-provider-failure");
  assert.equal(result.attempts[0].requestCountUnknown, true);
  assert.equal(result.attempts[1].reason, null);
  assert.equal(parseFallbackAiResult(result), result);
  assert.throws(() => parseFallbackAiResult({ ...result, attempts: result.attempts.map((attempt) =>
    ({ ...attempt, attemptId: result.attempts[0].attemptId })) }));
  const nontransient = await predictorHarness({ maxElapsedMs: 10_000, request: { timeoutMs: 2000 },
    generate() { throw new OpenAiTransportError("provider-failure"); } });
  assert.equal((await nontransient.predictor.predict(nontransient.input)).reason, "provider-failure");
  assert.equal(nontransient.calls.length, 1);
});

test("a retry cannot exceed the account-approved attempt allowance or replace discarded model output", async () => {
  const h = await predictorHarness({ maxElapsedMs: 10_000, job: { requestLimit: 1 }, request: { timeoutMs: 2000 },
    generate() { throw new OpenAiTransportError("transient"); } });
  assert.equal((await h.predictor.predict(h.input)).reason, "transient-provider-failure");
  assert.equal(h.calls.length, 1);
  const invalid = await predictorHarness({ maxElapsedMs: 10_000, request: { timeoutMs: 2000 },
    generate(_input, response) { return { ...response, value: { ...response.value, output: null } }; } });
  assert.equal((await invalid.predictor.predict(invalid.input)).reason, "invalid-output");
  assert.equal(invalid.calls.length, 1);
  const excessive = await predictorHarness({ request: { timeoutMs: predictorResilience.callTimeoutMs + 1 } });
  assert.equal((await excessive.predictor.predict(excessive.input)).reason, "time-limit");
  assert.equal(excessive.calls.length, 0);
});

test("the circuit opens after five provider failures, fences stale success and probes once after ten minutes", () => {
  let now = 10_000;
  const breaker = createPredictorCircuitBreaker(() => now);
  const stale = breaker.begin();
  for (let i = 0; i < 4; i++) breaker.begin().finish("failure");
  breaker.begin().finish("neutral");
  assert.ok(breaker.begin());
  breaker.begin().finish("failure");
  assert.equal(breaker.begin(), null);
  stale.finish("success");
  now += predictorResilience.openMs - 1;
  assert.equal(breaker.begin(), null);
  now++;
  const probe = breaker.begin();
  assert.ok(probe);
  assert.equal(breaker.begin(), null);
  probe.finish("failure");
  assert.equal(breaker.begin(), null);
  now += predictorResilience.openMs;
  breaker.begin().finish("success");
  for (let i = 0; i < 4; i++) breaker.begin().finish("failure");
  assert.ok(breaker.begin());
});
