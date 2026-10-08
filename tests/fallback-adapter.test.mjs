import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderFallbackCandidate, isProviderFallbackCurrent, parseProviderFallbackPolicy, parseProviderFallbackRequest } from "../src/server/fallback/fallback-adapter.ts";
import { getPublicationDeadline } from "../src/domain/calendar.ts";
import { evidenceContext, evidenceHash } from "./helpers/evidence-fixtures.mjs";
import { FALLBACK_NOW, FALLBACK_JOB, fallbackAdapterSetup, fallbackBounds, fallbackCanonical, fallbackPolicy,
  fallbackRawPrediction, fallbackResponse } from "./helpers/fallback-adapter-fixtures.mjs";

test("complete verified percentages use one protected dispatch and derive double chance from the same group", async () => {
  const state = fallbackAdapterSetup();
  const result = await state.fallback.collect(state.request());
  assert.equal(result.status, "candidate");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(result.requestCountUnknown, false);
  assert.deepEqual(result.candidate.markets.markets["match-result"].market.probabilities,
    { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  assert.deepEqual(result.candidate.markets.markets["double-chance"].market.probabilities,
    { "home-or-draw": 0.85, "away-or-draw": 0.4, "home-or-away": 0.75 });
  assert.equal(result.candidate.markets.markets["total-goals"].reason, "unsupported-family");
  assert.equal(result.candidate.markets.markets["both-teams-to-score"].reason, "unsupported-family");
  assert.deepEqual(result.candidate.timestamps, { generatedAt: null, retrievedAt: FALLBACK_NOW, providerUpdatedAt: null });
  assert.deepEqual(result.candidate.flags, ["unknown-generation-time", "unknown-provider-update-time"]);
  assert.equal(state.network[0].url.searchParams.get("fixture"), String(state.context.externalFixtureId));
  assert.equal(state.reservations[0].priority, "near-kickoff-fallback");
  assert.equal(state.completions[0].feedback.kind, "success");
  assert.equal(state.canonicalReads.length, 2);
  assert.equal(isProviderFallbackCurrent(result.candidate, state.context, FALLBACK_JOB, FALLBACK_NOW), true);
});

test("goal thresholds, winner picks and advice cannot manufacture totals or BTTS probability groups", async () => {
  const state = fallbackAdapterSetup({ respond: (url) => fallbackResponse(url, [fallbackRawPrediction(undefined, {
    predictions: { winner: { id: 10 }, win_or_draw: true, under_over: "+2.5", goals: { home: "2.5", away: "1.5" },
      advice: "Synthetic BTTS yes and exact score 3-1", percent: { home: "60%", draw: "25%", away: "15%" } },
  })]) });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.status, "candidate");
  assert.equal(result.candidate.markets.markets["total-goals"].available, false);
  assert.equal(result.candidate.markets.markets["both-teams-to-score"].available, false);
  assert.equal(Object.hasOwn(result.candidate.markets.markets, "exact-score"), false);
  assert.equal(JSON.stringify(result.candidate.markets).includes("3-1"), false);
});

test("unsupported-only refreshes skip credentials, quota and HTTP", async () => {
  const state = fallbackAdapterSetup();
  const result = await state.fallback.collect(state.request({ requestedGroups: ["total-goals", "both-teams-to-score"] }));
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "unsupported-markets");
  assert.equal(state.network.length, 0);
  assert.equal(state.reservations.length, 0);
  assert.equal(state.credentials.length, 0);
});

test("unverified regulation mappings, revoked rights and rejected unknown generation fail before paid dispatch", async () => {
  for (const [policy, authority, expected] of [
    [fallbackPolicy({ matchResultMapping: null }), {}, "unverified-mapping"],
    [fallbackPolicy(), { verifyMapping: () => false }, "unverified-mapping"],
    [fallbackPolicy(), { verifyMapping: () => { throw new Error("Synthetic private mapping failure"); } }, "unverified-mapping"],
    [fallbackPolicy(), { verifyPolicy: () => false }, "not-authorized"],
    [fallbackPolicy(), { verifySourceUrl: () => false }, "not-authorized"],
    [fallbackPolicy({ unknownGenerationTime: "reject" }), {}, "unknown-source-time"],
  ]) {
    const state = fallbackAdapterSetup({ policy, authority });
    const result = await state.fallback.collect(state.request());
    assert.equal(result.reason, expected);
    assert.equal(state.network.length, 0);
    assert.equal(state.reservations.length, 0);
  }
});

test("policies and requests reject omitted limits, invented fields and foreign cache scopes", () => {
  const state = fallbackAdapterSetup();
  const missing = fallbackPolicy(); delete missing.unknownGenerationTime;
  for (const policy of [missing, fallbackPolicy({ predictionFreshness: { maxRetrievalAgeMs: 10 } }),
    fallbackPolicy({ sourceUrl: "https://www.api-football.com/documentation-v3?api_key=private" }),
    fallbackPolicy({ matchResultMapping: { ...fallbackPolicy().matchResultMapping, period: "extra-time" } })])
    assert.throws(() => parseProviderFallbackPolicy(policy));
  for (const request of [state.request({ requestedGroups: [] }), state.request({ requestedGroups: ["match-result", "match-result"] }),
    state.request({ bounds: fallbackBounds({ cacheScope: "foreign-job" }) }),
    state.request({ bounds: fallbackBounds({ priority: "results-cutoff" }) }),
    state.request({ bounds: fallbackBounds({ priority: "daily-inputs" }) }),
    state.request({ bounds: fallbackBounds({ maxRequests: 0 }) }), { ...state.request(), publicRead: true }])
    assert.throws(() => parseProviderFallbackRequest(request));
});

test("canonical fixture revision, ordered team IDs, aliases and current scheduled status are mandatory", async () => {
  const context = evidenceContext();
  for (const [patch, expected] of [
    [{ dataVersion: 2n }, "wrong-identity"], [{ homeTeamId: context.away.teamId }, "wrong-identity"],
    [{ homeExternalIds: [999] }, "wrong-identity"], [{ kickoff: context.kickoffAt + 1 }, "wrong-identity"],
    [{ status: "live" }, "ineligible-refresh"], [{ status: "postponed" }, "ineligible-refresh"],
  ]) {
    const state = fallbackAdapterSetup({ context, fixture: fallbackCanonical(context, patch) });
    const result = await state.fallback.collect(state.request());
    assert.equal(result.reason, expected);
    assert.equal(state.network.length, 0);
  }
});

test("fixture-source freshness and unknown update policy are checked before fallback retrieval", async () => {
  for (const [policy, patch, expected] of [
    [fallbackPolicy(), { retrievedAt: FALLBACK_NOW - 60_001 }, "stale-context"],
    [fallbackPolicy(), { retrievedAt: FALLBACK_NOW + 1 }, "future-source-time"],
    [fallbackPolicy({ fixtureFreshness: { ...fallbackPolicy().fixtureFreshness, unknownUpdateTime: "reject" } }), {}, "unknown-source-time"],
  ]) {
    const state = fallbackAdapterSetup({ policy, fixture: fallbackCanonical(undefined, patch) });
    const result = await state.fallback.collect(state.request());
    assert.equal(result.reason, expected);
    assert.equal(state.network.length, 0);
  }
});

test("missing source update remains unknown and rejection cannot substitute retrieval time", async () => {
  const state = fallbackAdapterSetup({ policy: fallbackPolicy({ predictionFreshness: {
    ...fallbackPolicy().predictionFreshness, unknownUpdateTime: "reject",
  } }) });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "unknown-source-time");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(state.network.length, 1);
});

test("incomplete, invalid-sum and endpoint probability boundaries remain unavailable without normalization", async () => {
  for (const percent of [{ home: "60%", draw: "25%", away: null },
    { home: "60%", draw: "25%", away: "16%" }, { home: "100%", draw: "0%", away: "0%" }]) {
    const state = fallbackAdapterSetup({ respond: (url) => fallbackResponse(url, [fallbackRawPrediction(undefined, {
      predictions: { percent },
    })]) });
    const result = await state.fallback.collect(state.request());
    assert.equal(result.status, "candidate");
    assert.equal(result.candidate.markets.markets["match-result"].available, false);
    assert.equal(result.candidate.markets.markets["double-chance"].available, false);
    assert.equal(result.requestsDispatched, 1);
  }
});

test("a wrong provider home/away assignment cannot inherit requested fixture provenance", async () => {
  const state = fallbackAdapterSetup({ respond: (url) => fallbackResponse(url, [fallbackRawPrediction(undefined, {
    teams: { home: { id: 20 }, away: { id: 10 } },
  })]) });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "wrong-identity");
  assert.equal(result.requestsDispatched, 1);
});

test("the same permitted job cache retains original retrieval and source times at zero remaining requests", async () => {
  const state = fallbackAdapterSetup();
  const request = state.request({ bounds: fallbackBounds({ cacheMaxAgeMs: 10_000 }) });
  const first = await state.fallback.collect(request);
  state.setNow(FALLBACK_NOW + 1000);
  const second = await state.fallback.collect(request);
  assert.equal(first.status, "candidate");
  assert.equal(second.status, "candidate");
  assert.equal(second.requestsDispatched, 0);
  assert.equal(second.candidate.provenance.fromCache, true);
  assert.deepEqual(second.candidate.timestamps, first.candidate.timestamps);
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
});

test("cache misses and revoked reuse do not renew a spent job request allowance", async () => {
  for (const cached of [false, true]) {
    const state = fallbackAdapterSetup();
    const request = state.request({ bounds: fallbackBounds({ cacheMaxAgeMs: cached ? 10_000 : 0 }) });
    assert.equal((await state.fallback.collect(request)).status, "candidate");
    if (cached) state.setCacheAllowed(false);
    const result = await state.fallback.collect(request);
    assert.equal(result.reason, "request-budget-exhausted");
    assert.equal(result.requestsDispatched, 0);
    assert.equal(state.network.length, 1);
    assert.equal(state.reservations.length, 1);
  }
});

test("one job cannot change context, inflate limits, renew time or share a different job's cache", async () => {
  const state = fallbackAdapterSetup();
  const request = state.request({ bounds: fallbackBounds({ cacheMaxAgeMs: 10_000 }) });
  assert.equal((await state.fallback.collect(request)).status, "candidate");
  for (const changed of [
    { ...request, context: { ...request.context, cycleId: "10000000-0000-4000-8000-000000000099" } },
    { ...request, bounds: { ...request.bounds, maxRequests: 2 } },
    { ...request, bounds: { ...request.bounds, deadlineAt: request.bounds.deadlineAt + 1 } },
    { ...request, bounds: { ...request.bounds, timeoutMs: request.bounds.timeoutMs + 1 } },
  ]) assert.equal((await state.fallback.collect(changed)).reason, "invalid-request");
  const different = await state.fallback.collect({ ...request, jobId: evidenceHash("synthetic-other-fallback-job") });
  assert.equal(different.status, "candidate");
  assert.equal(different.candidate.provenance.fromCache, false);
  assert.equal(state.network.length, 2);
});

test("successful bounded retry keeps prior failed observations and charges both actual requests", async () => {
  const state = fallbackAdapterSetup({ respond: (url, _init, number) => number === 1
    ? fallbackResponse(url, [], { status: 500 }) : fallbackResponse(url, [fallbackRawPrediction()]) });
  const result = await state.fallback.collect(state.request({ bounds: fallbackBounds({ maxRequests: 2,
    retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 } }) }));
  assert.equal(result.status, "candidate");
  assert.equal(result.requestsDispatched, 2);
  assert.equal(result.requestCountUnknown, false);
  assert.equal(state.network.length, 2);
  assert.equal(state.completions.length, 2);
});

test("account-wide quota denial returns a private denial without provider HTTP", async () => {
  const state = fallbackAdapterSetup({ limiter: { async reserve() { return { status: "denied", reason: "daily-limit" }; } } });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "quota-denied");
  assert.equal(result.requestsDispatched, 0);
  assert.equal(state.network.length, 0);
});

test("fresh canonical eligibility is rechecked inside the protected launch after the quota claim", async () => {
  let state;
  state = fallbackAdapterSetup({ limiter: { async claimLaunch() {
    state.setAllowed(false); return { status: "claimed", timeoutMs: 1000 };
  } } });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "not-authorized");
  assert.equal(result.requestsDispatched, 0);
  assert.equal(state.network.length, 0);
});

test("a changed catalogue revision during the response cannot produce a candidate", async () => {
  let state;
  state = fallbackAdapterSetup({ respond: (url) => {
    state.setCanonical(fallbackCanonical(state.context, { dataVersion: 2n }));
    return fallbackResponse(url, [fallbackRawPrediction(state.context)]);
  } });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "wrong-identity");
  assert.equal(result.requestsDispatched, 1);
});

test("the fixed publication cutoff overrides a later caller allowance", async () => {
  const context = evidenceContext(undefined, { kickoffAt: FALLBACK_NOW + 300_000 });
  const state = fallbackAdapterSetup({ context });
  assert.equal(getPublicationDeadline(context.kickoffAt), FALLBACK_NOW);
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "timeout");
  assert.equal(state.network.length, 0);
});

test("a caller abort cancels transport and a late response cannot become reusable evidence", async () => {
  let release, started;
  const began = new Promise((resolve) => { started = resolve; });
  const state = fallbackAdapterSetup({ respond: (url) => {
    started(); return new Promise((resolve) => { release = () => resolve(fallbackResponse(url, [fallbackRawPrediction()])); });
  } });
  const controller = new AbortController();
  const waiting = state.fallback.collect(state.request({ bounds: fallbackBounds({ deadlineAt: FALLBACK_NOW + 5000 }) }),
    { signal: controller.signal, deadlineAt: FALLBACK_NOW + 5000, check() {} });
  await began;
  controller.abort();
  const result = await waiting;
  assert.equal(result.reason, "timeout");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(result.requestCountUnknown, true);
  assert.equal(state.network[0].init.signal.aborted, true);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.network.length, 1);
});

test("async proof callbacks fail closed without unhandled rejections or paid requests", async () => {
  for (const authority of [
    { authorize: async () => { throw new Error("Synthetic private rejected authorization"); } },
    { verifyPolicy: async () => { throw new Error("Synthetic private rejected policy"); } },
    { verifyContext: async () => true },
  ]) {
    const state = fallbackAdapterSetup({ authority });
    const result = await state.fallback.collect(state.request());
    assert.equal(result.reason, "not-authorized");
    assert.equal(state.network.length, 0);
  }
});

test("current candidate checks reject copies, foreign jobs, stale original clocks and revoked mapping", async () => {
  const state = fallbackAdapterSetup();
  const result = await state.fallback.collect(state.request());
  assert.equal(result.status, "candidate");
  assert.doesNotThrow(() => assertProviderFallbackCandidate(result.candidate, state.context, FALLBACK_JOB, FALLBACK_NOW));
  assert.throws(() => assertProviderFallbackCandidate({ ...result.candidate }, state.context, FALLBACK_JOB, FALLBACK_NOW));
  assert.equal(isProviderFallbackCurrent(result.candidate, state.context, evidenceHash("foreign-job"), FALLBACK_NOW), false);
  assert.equal(isProviderFallbackCurrent(result.candidate, state.context, FALLBACK_JOB, FALLBACK_NOW + 60_001), false);
  state.setMappingAllowed(false);
  assert.throws(() => assertProviderFallbackCandidate(result.candidate, state.context, FALLBACK_JOB, FALLBACK_NOW));
});

test("proof callbacks cannot age a source past its policy and still return a candidate", async () => {
  let state, proofCalls = 0;
  state = fallbackAdapterSetup({ authority: { verifyObservation() {
    if (++proofCalls === 2) state.setNow(FALLBACK_NOW + 60_001);
    return true;
  } } });
  const result = await state.fallback.collect(state.request({ bounds: fallbackBounds({ deadlineAt: FALLBACK_NOW + 200_000 }) }));
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "stale-context");
});

test("asserting with an old explicit timestamp cannot bypass the actual configured clock", async () => {
  const state = fallbackAdapterSetup();
  const result = await state.fallback.collect(state.request());
  state.setNow(FALLBACK_NOW + 60_001);
  assert.throws(() => assertProviderFallbackCandidate(result.candidate, state.context, FALLBACK_JOB, FALLBACK_NOW));
});

test("bounded job capacity never evicts a spent allowance and silently renews it", async () => {
  const state = fallbackAdapterSetup({ maxJobs: 1 });
  assert.equal((await state.fallback.collect(state.request())).status, "candidate");
  const result = await state.fallback.collect(state.request({ jobId: evidenceHash("second-bounded-job") }));
  assert.equal(result.reason, "request-budget-exhausted");
  assert.equal(state.network.length, 1);
});

test("tightened job limits cannot later be loosened back to the earlier allowance", async () => {
  const state = fallbackAdapterSetup();
  const first = state.request({ bounds: fallbackBounds({ cacheMaxAgeMs: 10_000 }) });
  assert.equal((await state.fallback.collect(first)).status, "candidate");
  const tightened = { ...first, bounds: { ...first.bounds, deadlineAt: first.bounds.deadlineAt - 100, timeoutMs: 900 } };
  assert.equal((await state.fallback.collect(tightened)).status, "candidate");
  assert.equal((await state.fallback.collect(first)).reason, "invalid-request");
  assert.equal(state.network.length, 1);
});

test("provider clock rollback after a dispatched response cannot create a candidate", async () => {
  let state;
  state = fallbackAdapterSetup({ respond: (url) => {
    state.setNow(FALLBACK_NOW - 1);
    return fallbackResponse(url, [fallbackRawPrediction()]);
  } });
  const result = await state.fallback.collect(state.request());
  assert.equal(result.reason, "clock-regression");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(state.network.length, 1);
});

test("concurrent contenders cannot clear another collector's owning job guard", async () => {
  let release, started;
  const began = new Promise((resolve) => { started = resolve; });
  const state = fallbackAdapterSetup({ respond: (url) => {
    started(); return new Promise((resolve) => { release = () => resolve(fallbackResponse(url, [fallbackRawPrediction()])); });
  } });
  const request = state.request();
  const first = state.fallback.collect(request);
  await began;
  assert.equal((await state.fallback.collect(request)).reason, "provider-unavailable");
  assert.equal((await state.fallback.collect({ ...request, bounds: { ...request.bounds, maxRequests: 2 } })).reason, "invalid-request");
  assert.equal((await state.fallback.collect(request)).reason, "provider-unavailable");
  assert.equal(state.canonicalReads.length, 1);
  assert.equal(state.network.length, 1);
  release();
  assert.equal((await first).status, "candidate");
  assert.equal((await state.fallback.collect(request)).reason, "request-budget-exhausted");
  assert.equal(state.network.length, 1);
});
