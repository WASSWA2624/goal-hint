import assert from "node:assert/strict";
import test from "node:test";
import { marketRules } from "../src/domain/markets.ts";
import { evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { assertProviderFallbackCandidate } from "../src/server/fallback/fallback-adapter.ts";
import { evidenceHash } from "./helpers/evidence-fixtures.mjs";
import { FALLBACK_NOW, fallbackPolicy, fallbackRawPrediction, fallbackResponse } from "./helpers/fallback-adapter-fixtures.mjs";
import { fallbackFixture, fallbackAiDenied } from "./helpers/fallback-fixtures.mjs";
import { fallbackServiceSetup } from "./helpers/fallback-service-fixtures.mjs";
import { modelVersion } from "./helpers/predictor-fixtures.mjs";

const total = (over = 0.6) => ({ period: marketRules.period, line: 2.5, probabilities: { "over-2.5": over, "under-2.5": 1 - over } });
const btts = (yes = 0.6) => ({ period: marketRules.period, probabilities: { yes, no: 1 - yes } });
const result = () => ({ period: marketRules.period, probabilities: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } });
const partialOutput = { groups: { "match-result": null, "total-goals": total(), "both-teams-to-score": btts() } };
const selected = (value, family) => {
  assert.equal(value.status, "candidate");
  const selection = value.candidate.markets[family]; assert.equal(selection.available, true); return selection;
};

test("a complete genuine AI candidate does not invoke fallback or spend football capacity", async () => {
  const setup = fallbackServiceSetup(), value = await setup.service.resolve(setup.request());
  for (const family of ["match-result", "double-chance", "total-goals", "both-teams-to-score"]) {
    assert.equal(selected(value, family).market.source, "ai");
  }
  assert.equal(setup.collected.length, 0); assert.equal(setup.provider.network.length, 0);
  assert.equal(setup.provider.reservations.length, 0); assert.equal(value.requestsDispatched, 0);
  assert.equal(value.requestCountUnknown, false);
  assert.equal(value.candidate.reasons[0].text, setup.ai.output.reasons[0].text);
});

test("missing unsupported binary families preserve AI result without provider HTTP", async () => {
  const setup = fallbackServiceSetup({ output: { groups: { "match-result": result() } } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(selected(value, "match-result").market.source, "ai");
  assert.equal(selected(value, "double-chance").market.source, "ai");
  for (const family of ["total-goals", "both-teams-to-score"]) assert.equal(value.candidate.markets[family].available, false);
  assert.equal(setup.collected.length, 1); assert.deepEqual(setup.collected[0].requestedGroups, ["total-goals", "both-teams-to-score"]);
  assert.equal(setup.provider.network.length, 0); assert.equal(value.requestsDispatched, 0);
});

test("real adapter fallback fills one whole missing result group and keeps valid AI binary groups", async () => {
  const setup = fallbackServiceSetup({ output: partialOutput }), value = await setup.service.resolve(setup.request());
  const match = selected(value, "match-result"), chance = selected(value, "double-chance");
  assert.equal(match.market.source, "api-football"); assert.equal(chance.market.source, "api-football");
  assert.deepEqual(match.market.probabilities, { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  assert.deepEqual(chance.market.probabilities, { "home-or-draw": 0.85, "away-or-draw": 0.4, "home-or-away": 0.75 });
  assert.deepEqual(match.fallback, { reason: "ai-missing-group", detail: "missing-group" });
  assert.strictEqual(match.provenance, chance.provenance); assert.strictEqual(match.timestamps, chance.timestamps);
  assert.equal(selected(value, "total-goals").market.source, "ai"); assert.equal(selected(value, "both-teams-to-score").market.source, "ai");
  assert.equal(setup.provider.network.length, 1); assert.equal(value.requestsDispatched, 1);
  assert.equal(match.timestamps.generatedAt, null); assert.equal(match.timestamps.providerUpdatedAt, null);
});

test("incomplete AI result never contributes values to the provider distribution", async () => {
  const setup = fallbackServiceSetup({ output: { groups: { "match-result": { period: marketRules.period,
    probabilities: { "home-win": 0.9 } }, "total-goals": total() } } });
  const value = await setup.service.resolve(setup.request());
  assert.deepEqual(selected(value, "match-result").market.probabilities, { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  assert.equal(selected(value, "match-result").fallback.reason, "ai-invalid-group");
  assert.equal(selected(value, "match-result").fallback.detail, "incomplete-group");
});

test("conflicting fallback result is omitted while valid AI groups survive", async () => {
  const fixture = fallbackFixture({ output: { groups: { "total-goals": total(0.1), "both-teams-to-score": btts(0.8) } } });
  const setup = fallbackServiceSetup({ fixture, provider: { respond: (url) => fallbackResponse(url, [fallbackRawPrediction(fixture.expected.context,
    { predictions: { percent: { home: "80%", draw: "5%", away: "15%" } } })]) } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(selected(value, "total-goals").market.source, "ai"); assert.equal(selected(value, "both-teams-to-score").market.source, "ai");
  for (const family of ["match-result", "double-chance"]) assert.deepEqual(value.candidate.markets[family], { available: false, reason: "cross-market-conflict" });
  assert.equal(setup.provider.network.length, 1); assert.ok(value.candidate.issues.some((issue) => issue.reason === "cross-market-conflict"));
});

for (const [reason, trigger] of [["timeout", "ai-timeout"], ["time-limit", "ai-timeout"],
  ["insufficient-evidence", "ai-insufficient-evidence"], ["budget-exhausted", "ai-budget-exhausted"],
  ["job-budget-exhausted", "ai-budget-exhausted"], ["token-limit", "ai-budget-exhausted"],
  ["request-limit", "ai-budget-exhausted"], ["billed-unit-limit", "ai-budget-exhausted"],
  ["invalid-output", "ai-failure"], ["unconfigured", "ai-failure"]]) {
  test(`verified AI ${reason} attempts only bounded provider fallback`, async () => {
    const setup = fallbackServiceSetup({ reason }), value = await setup.service.resolve(setup.request());
    assert.deepEqual(selected(value, "match-result").fallback, { reason: trigger, detail: reason });
    assert.equal(setup.provider.network.length, 1); assert.equal(setup.provider.reservations.length, 1);
    assert.equal(value.candidate.markets["total-goals"].available, false);
    assert.equal(value.candidate.markets["both-teams-to-score"].available, false);
  });
}

test("quota exhaustion yields retention instruction and never invents a publication", async () => {
  const setup = fallbackServiceSetup({ reason: "budget-exhausted", provider: { limiter: {
    async reserve() { return { status: "denied", reason: "daily-limit" }; },
  } } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.status, "retain-previous-or-unavailable");
  assert.equal(value.candidate.audit.providerReason, "quota-denied");
  assert.ok(Object.values(value.candidate.markets).every((market) => market.available === false));
  assert.equal(setup.provider.network.length, 0); assert.equal(value.requestsDispatched, 0);
  assert.equal(Object.hasOwn(value, "publishedAt"), false);
});

test("unchanged same-job reuse keeps original timestamps and does not renew spent allowance", async () => {
  const setup = fallbackServiceSetup({ reason: "timeout", bounds: { cacheMaxAgeMs: 5000 } });
  const first = await setup.service.resolve(setup.request()), original = selected(first, "match-result");
  setup.setNow(FALLBACK_NOW + 200);
  const cached = await setup.service.resolve(setup.request({ requestId: evidenceHash("synthetic-second-fallback-access") }));
  const reused = selected(cached, "match-result");
  assert.deepEqual(reused.timestamps, original.timestamps); assert.equal(reused.provenance.source.fromCache, true);
  assert.equal(cached.requestsDispatched, 0); assert.equal(setup.provider.network.length, 1);
  setup.provider.setCacheAllowed(false);
  const exhausted = await setup.service.resolve(setup.request({ requestId: evidenceHash("synthetic-third-fallback-access") }));
  assert.equal(exhausted.status, "retain-previous-or-unavailable");
  assert.equal(exhausted.candidate.audit.providerReason, "request-budget-exhausted");
  assert.equal(setup.provider.network.length, 1); assert.equal(exhausted.requestsDispatched, 0);
});

test("same original job allowance can reuse cached fallback across shorter per-call deadlines", async () => {
  const setup = fallbackServiceSetup({ reason: "timeout", bounds: {
    deadlineAt: FALLBACK_NOW + 10_000, maxRequests: 1, cacheMaxAgeMs: 5000,
  } });
  const originalRequest = setup.request(), first = await setup.service.resolve(originalRequest);
  const original = selected(first, "match-result");
  assert.equal(original.timestamps.retrievedAt, FALLBACK_NOW); assert.equal(first.requestsDispatched, 1);
  setup.setNow(FALLBACK_NOW + 200);
  const second = await setup.service.resolve(originalRequest), cached = selected(second, "match-result");
  assert.equal(cached.provenance.source.fromCache, true); assert.deepEqual(cached.timestamps, original.timestamps);
  assert.equal(second.requestsDispatched, 0); assert.equal(second.requestCountUnknown, false);
  assert.equal(setup.provider.network.length, 1); assert.equal(setup.provider.reservations.length, 1);
});

test("unconfigured fallback returns only valid AI groups without inheriting an old snapshot", async () => {
  const setup = fallbackServiceSetup({ output: { groups: { "total-goals": total() } }, service: { fallback: null } });
  const value = await setup.service.resolve(setup.request({ bounds: null }));
  assert.equal(selected(value, "total-goals").market.source, "ai");
  for (const family of ["match-result", "double-chance", "both-teams-to-score"]) assert.equal(value.candidate.markets[family].available, false);
  assert.equal(value.candidate.audit.providerReason, "unconfigured"); assert.equal(setup.provider.network.length, 0);
});

test("pick-only and malformed actual provider output leave valid partial AI available", async () => {
  for (const predictions of [{ winner: { id: 10 }, under_over: "-2.5", advice: "Synthetic pick only" },
    { percent: { home: "60%", draw: "invalid%", away: "15%" } }]) {
    const setup = fallbackServiceSetup({ output: partialOutput, provider: { respond: (url) =>
      fallbackResponse(url, [fallbackRawPrediction(undefined, { predictions })]) } });
    const value = await setup.service.resolve(setup.request());
    assert.equal(selected(value, "total-goals").market.source, "ai");
    assert.equal(value.candidate.markets["match-result"].available, false); assert.equal(value.requestsDispatched, 1);
  }
});

test("unexpected provider throws and malformed receipts preserve already valid partial AI", async () => {
  for (const collect of [async () => { throw new Error("synthetic-private-provider-diagnostic"); },
    async () => ({ status: "candidate", candidate: {}, requestsDispatched: 1, requestCountUnknown: false })]) {
    const setup = fallbackServiceSetup({ output: partialOutput, service: { fallback: { collect } } });
    const value = await setup.service.resolve(setup.request());
    assert.equal(selected(value, "total-goals").market.source, "ai");
    assert.equal(value.candidate.markets["match-result"].available, false);
    assert.equal(evidenceSerialize(value).includes("synthetic-private-provider-diagnostic"), false);
  }
});

for (const policy of [fallbackPolicy({ unknownGenerationTime: "reject" }), fallbackPolicy({ predictionFreshness: {
  maxRetrievalAgeMs: 60_000, maxSourceAgeMs: 120_000, unknownUpdateTime: "reject", evidenceRef: "synthetic-known-source-time-required" } })]) {
  test(`unknown source times obey explicit policy ${policy.unknownGenerationTime}/${policy.predictionFreshness.unknownUpdateTime}`, async () => {
    const setup = fallbackServiceSetup({ reason: "timeout", provider: { policy } }), value = await setup.service.resolve(setup.request());
    assert.equal(value.status, "retain-previous-or-unavailable"); assert.equal(value.candidate.audit.providerReason, "unknown-source-time");
    assert.equal(setup.provider.network.length, policy.unknownGenerationTime === "reject" ? 0 : 1);
  });
}

test("revoked source permission denies provider and retains valid AI groups", async () => {
  const setup = fallbackServiceSetup({ output: partialOutput }); setup.permissions.provider = false;
  const value = await setup.service.resolve(setup.request());
  assert.equal(selected(value, "total-goals").market.source, "ai");
  assert.equal(value.candidate.markets["match-result"].available, false); assert.equal(value.candidate.audit.providerReason, "not-authorized");
});

for (const member of ["authorize", "verifyContext", "verifyAi"]) {
  test(`asynchronous ${member} cannot approve any fallback dispatch`, async () => {
    const setup = fallbackServiceSetup({ reason: "timeout", authority: { [member]: async () => { throw new Error("synthetic rejected async approval"); } } });
    const value = await setup.service.resolve(setup.request());
    assert.equal(value.status, "denied"); assert.equal(value.reason, "not-authorized"); assert.equal(setup.provider.network.length, 0);
  });
}

test("forged AI failure cannot consume fallback capacity", async () => {
  const setup = fallbackServiceSetup({ reason: "budget-exhausted" });
  const value = await setup.service.resolve(setup.request({ ai: fallbackAiDenied("timeout") }));
  assert.equal(value.status, "denied"); assert.equal(value.reason, "not-authorized"); assert.equal(setup.collected.length, 0);
});

test("cutoff is strict and current refresh authority can close an earlier kickoff", async () => {
  const setup = fallbackServiceSetup({ reason: "timeout" });
  setup.setNow(setup.expected.context.kickoffAt - 300_000);
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.reason, "ineligible-refresh"); assert.equal(setup.provider.network.length, 0);
  const changed = fallbackServiceSetup({ reason: "timeout" }); changed.permissions.refresh = false;
  assert.equal((await changed.service.resolve(changed.request())).reason, "not-authorized"); assert.equal(changed.provider.network.length, 0);
});

test("synchronous authorization delay exhausting the deadline prevents provider work", async () => {
  let setup;
  setup = fallbackServiceSetup({ reason: "timeout", authority: { authorize() { setup.setNow(FALLBACK_NOW + 1001); } } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.status, "denied"); assert.equal(value.reason, "timeout"); assert.equal(setup.provider.network.length, 0);
});

test("wall-clock regression during current verification prevents dispatch", async () => {
  let setup;
  setup = fallbackServiceSetup({ reason: "timeout", authority: { verifyContext() { setup.setNow(FALLBACK_NOW - 1); return true; } } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.status, "denied"); assert.equal(value.reason, "clock-regression"); assert.equal(setup.provider.network.length, 0);
});

test("an unfinished collector times out with unknown request accounting and no late output", async () => {
  const setup = fallbackServiceSetup({ reason: "timeout", service: { fallback: { collect: async () => new Promise(() => {}) } } });
  const value = await setup.service.resolve(setup.request({ maxElapsedMs: 25 }));
  assert.equal(value.status, "denied"); assert.equal(value.reason, "timeout"); assert.equal(value.requestCountUnknown, true);
  assert.equal(value.requestsDispatched, 0); assert.equal(Object.hasOwn(value, "candidate"), false);
});

test("duplicate pending refreshes join one provider call and conflicting requests do not", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const setup = fallbackServiceSetup({ reason: "timeout", provider: { respond: async (url) => {
    await gate; return fallbackResponse(url, [fallbackRawPrediction()]);
  } } });
  const input = setup.request(), first = setup.service.resolve(input), duplicate = setup.service.resolve(input);
  assert.strictEqual(first, duplicate);
  const conflict = await setup.service.resolve(setup.request({ maxElapsedMs: 999 }));
  assert.equal(conflict.reason, "conflicting-request");
  release(); const value = await first; assert.equal(value.status, "candidate"); assert.equal(setup.provider.network.length, 1);
});

test("expired AI distributions request fallback without copying old otherwise valid families", async () => {
  const fixture = fallbackFixture({ model: modelVersion({ outputTiming: { maxAgeMs: 5000 } }) });
  const setup = fallbackServiceSetup({ fixture }), value = await setup.service.resolve(setup.request());
  assert.equal(selected(value, "match-result").market.source, "api-football");
  assert.deepEqual(setup.collected[0].requestedGroups, ["match-result", "total-goals", "both-teams-to-score"]);
  assert.equal(value.candidate.audit.aiReason, "invalid-timing");
  assert.equal(value.candidate.markets["total-goals"].available, false); assert.equal(value.candidate.markets["both-teams-to-score"].available, false);
});

test("cached source expiry is checked independently of cache lifetime and retrieval is never renewed", async () => {
  const policy = fallbackPolicy(); policy.predictionFreshness.maxRetrievalAgeMs = 100;
  const setup = fallbackServiceSetup({ reason: "timeout", provider: { policy }, bounds: { cacheMaxAgeMs: 5000 } });
  const first = await setup.service.resolve(setup.request()); assert.equal(selected(first, "match-result").timestamps.retrievedAt, FALLBACK_NOW);
  setup.setNow(FALLBACK_NOW + 200);
  const expired = await setup.service.resolve(setup.request({ requestId: evidenceHash("synthetic-expired-cache-access") }));
  assert.equal(expired.status, "retain-previous-or-unavailable"); assert.equal(expired.candidate.audit.providerReason, "stale");
  assert.equal(setup.provider.network.length, 1); assert.equal(expired.requestsDispatched, 0);
});

test("real provider transport timeout preserves usable AI groups with counted uncertain attempt", async () => {
  const setup = fallbackServiceSetup({ output: partialOutput, bounds: { timeoutMs: 25 },
    provider: { limiter: { async claimLaunch() { return { status: "claimed", timeoutMs: 25 }; } },
      respond: async () => new Promise(() => {}) } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(selected(value, "total-goals").market.source, "ai"); assert.equal(value.candidate.markets["match-result"].available, false);
  assert.equal(value.requestsDispatched, 1); assert.equal(value.requestCountUnknown, true);
  assert.equal(setup.provider.network.length, 1);
});

test("refresh rights revoked after an actual response prevent candidate return", async () => {
  let setup;
  setup = fallbackServiceSetup({ reason: "timeout", provider: { respond: (url) => {
    setup.permissions.refresh = false;
    return fallbackResponse(url, [fallbackRawPrediction(setup.expected.context)]);
  } } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.status, "denied"); assert.equal(value.reason, "not-authorized");
  assert.equal(value.requestsDispatched, 1); assert.equal(Object.hasOwn(value, "candidate"), false);
});

for (const source of ["provider", "ai"]) {
  test(`final ${source} expiry drops only stale groups and preserves fresh groups from the other source`, async () => {
    const fixture = fallbackFixture({ output: partialOutput,
      ...(source === "ai" ? { model: modelVersion({ outputTiming: { maxAgeMs: 9050 } }) } : {}) });
    const policy = fallbackPolicy();
    if (source === "provider") policy.predictionFreshness.maxRetrievalAgeMs = 50;
    const setup = fallbackServiceSetup({ fixture, provider: { policy } });
    let providerProofs = 0, advanced = false;
    const authority = { ...setup.authority,
      verifyProvider(candidate, context, now) {
        assertProviderFallbackCandidate(candidate, context.context, context.jobId, now); providerProofs++; return true;
      },
      verifyAi(ai) {
        if (providerProofs >= 2 && !advanced) { advanced = true; setup.setNow(FALLBACK_NOW + 100); }
        return ai === setup.ai;
      },
    };
    const service = setup.makeService({ authority }), value = await service.resolve(setup.request());
    assert.equal(advanced, true); assert.equal(value.status, "candidate");
    if (source === "provider") {
      assert.equal(value.candidate.markets["match-result"].available, false);
      assert.equal(value.candidate.markets["double-chance"].available, false);
      assert.equal(selected(value, "total-goals").market.source, "ai");
      assert.equal(selected(value, "both-teams-to-score").market.source, "ai");
      assert.deepEqual(selected(value, "total-goals").timestamps, {
        generatedAt: fixture.ai.output.timestamps.generatedAt, retrievedAt: fixture.ai.output.timestamps.retrievedAt,
        providerUpdatedAt: fixture.ai.output.timestamps.providerUpdatedAt,
      });
    } else {
      assert.equal(selected(value, "match-result").market.source, "api-football");
      assert.equal(selected(value, "double-chance").market.source, "api-football");
      assert.equal(value.candidate.markets["total-goals"].available, false);
      assert.equal(value.candidate.markets["both-teams-to-score"].available, false);
      assert.deepEqual(selected(value, "match-result").timestamps, {
        generatedAt: null, retrievedAt: FALLBACK_NOW, providerUpdatedAt: null,
      });
    }
    assert.equal(value.requestsDispatched, 1); assert.equal(setup.provider.network.length, 1);
  });
}

test("asynchronous owning-request proof is rejected before any provider dispatch", async () => {
  const setup = fallbackServiceSetup({ reason: "timeout", service: { verifyRequest: async () => true } });
  const value = await setup.service.resolve(setup.request());
  assert.equal(value.reason, "not-authorized"); assert.equal(setup.provider.network.length, 0);
});

test("a second source expiry during bounded recomposition prevents output and never spends another request", async () => {
  const fixture = fallbackFixture({ output: partialOutput, model: modelVersion({ outputTiming: { maxAgeMs: 9200 } }) });
  const policy = fallbackPolicy(); policy.predictionFreshness.maxRetrievalAgeMs = 50;
  const setup = fallbackServiceSetup({ fixture, provider: { policy } });
  let providerProofs = 0, advances = 0;
  const authority = { ...setup.authority,
    verifyProvider(candidate, context, now) {
      assertProviderFallbackCandidate(candidate, context.context, context.jobId, now); providerProofs++; return true;
    },
    verifyAi(ai) {
      if (providerProofs >= 2 && advances < 2) { advances++; setup.setNow(FALLBACK_NOW + (advances === 1 ? 100 : 300)); }
      return ai === setup.ai;
    },
  };
  const service = setup.makeService({ authority }), value = await service.resolve(setup.request());
  assert.equal(advances, 2); assert.equal(value.status, "denied"); assert.equal(value.reason, "invalid-timing");
  assert.equal(value.requestsDispatched, 1); assert.equal(setup.provider.network.length, 1);
  assert.equal(Object.hasOwn(value, "candidate"), false);
});

test("inflight capacity does not authorize an additional provider operation", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const setup = fallbackServiceSetup({ reason: "timeout", service: { maxInflight: 1 }, provider: {
    respond: async (url) => { await gate; return fallbackResponse(url, [fallbackRawPrediction()]); },
  } });
  const first = setup.service.resolve(setup.request());
  const second = await setup.service.resolve(setup.request({ requestId: evidenceHash("synthetic-over-capacity-refresh") }));
  assert.equal(second.reason, "capacity-exhausted"); release();
  assert.equal((await first).status, "candidate"); assert.equal(setup.provider.network.length, 1);
});
