import assert from "node:assert/strict";
import test from "node:test";
import { resolveFallbackCandidate } from "../src/server/fallback/fallback-resolution.ts";
import { parseResolvedForecastCandidate } from "../src/server/fallback/fallback-input.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { fallbackAuthority, fallbackFixture, fallbackProvider } from "./helpers/fallback-fixtures.mjs";
import { fallbackServiceSetup } from "./helpers/fallback-service-fixtures.mjs";
import { FALLBACK_NOW } from "./helpers/fallback-adapter-fixtures.mjs";
import { parseForecastSourceReceipts } from "../src/server/fallback/source-receipts.ts";

const baseline = (fixture, provider, authority = fixture.authority) => resolveFallbackCandidate({
  expected: fixture.expected, ai: fixture.ai, provider, now: fixture.now,
}, authority, "provider-baseline");
const baselineSetup = (options = {}) => {
  const h = fallbackServiceSetup({ ...options, bounds: { deadlineAt: FALLBACK_NOW + 30_000, ...options.bounds } });
  return { ...h, request: (overrides = {}) => h.request({ maxElapsedMs: 30_000, ...overrides }) };
};

test("the provider benchmark wins over a valid AI candidate and leaves unsupported groups unavailable", () => {
  const fixture = fallbackFixture(), originalAi = evidenceFingerprint(fixture.ai), provider = fallbackProvider(fixture.expected);
  const result = baseline(fixture, provider);
  assert.equal(result.status, "candidate");
  const parsed = parseResolvedForecastCandidate(result.candidate);
  for (const family of ["match-result", "double-chance"]) {
    const entry = parsed.markets[family];
    assert.equal(entry.market.source, "api-football");
    assert.deepEqual(entry.timestamps, provider.candidate.timestamps);
    assert.equal(entry.fallback.reason, "provider-baseline");
  }
  assert.equal(parsed.markets["total-goals"].available, false);
  assert.equal(parsed.markets["both-teams-to-score"].available, false);
  assert.equal(parsed.audit.aiStatus, "candidate");
  assert.equal(parsed.audit.aiReason, null);
  assert.equal(evidenceFingerprint(fixture.ai), originalAi, "shadow output keeps its original context, evidence and source clocks");
  assert.match(parsed.reasons[0].text, /provider benchmark/u);
});

test("a missing, denied, unowned or revoked provider cannot promote shadow AI", () => {
  const fixture = fallbackFixture(), valid = fallbackProvider(fixture.expected);
  for (const provider of [null, { status: "denied", reason: "quota-denied", requestsDispatched: 0, requestCountUnknown: false },
    fallbackProvider(fixture.expected, { candidate: { context: { ...fixture.expected.context, fixtureVersion: 2n } } })]) {
    const result = baseline(fixture, provider);
    assert.equal(result.status, "retain-previous-or-unavailable");
    assert.ok(Object.values(result.candidate.markets).every((entry) => !entry.available));
  }
  let verifications = 0;
  const revoked = baseline(fixture, valid, fallbackAuthority({ verifyProvider: () => ++verifications === 1 }));
  assert.equal(revoked.status, "retain-previous-or-unavailable");
  assert.equal(verifications, 2);
  assert.ok(Object.values(revoked.candidate.markets).every((entry) => !entry.available));
});

test("baseline collection runs with complete AI inside the original football allowance", async () => {
  const h = baselineSetup({ service: { selectionPolicy: undefined } });
  const before = evidenceFingerprint(h.ai), result = await h.service.resolve(h.request());
  assert.equal(result.status, "candidate");
  assert.equal(result.candidate.markets["match-result"].market.source, "api-football");
  assert.equal(result.candidate.markets["total-goals"].available, false);
  assert.equal(h.collected.length, 1);
  assert.deepEqual(h.collected[0].requestedGroups, ["match-result", "total-goals", "both-teams-to-score"]);
  assert.deepEqual(h.collected[0].bounds, { ...h.request().bounds, cacheScope: h.expected.jobId });
  assert.equal(h.provider.network.length, 1);
  assert.equal(result.requestsDispatched, 1);
  assert.equal(evidenceFingerprint(h.ai), before);
});

test("baseline interruptions, missing configuration and quota failure preserve unavailable rather than promoting AI", async () => {
  for (const service of [{ fallback: null }, { fallback: { async collect() { throw new Error("synthetic private outage"); } } }]) {
    const h = baselineSetup({ service: { ...service, selectionPolicy: "provider-baseline" } });
    for (const result of [await h.service.resolve(h.request()), h.service.resolveWithoutProvider(h.request())]) {
      assert.equal(result.status, "retain-previous-or-unavailable");
      assert.ok(Object.values(result.candidate.markets).every((entry) => !entry.available));
    }
  }
  const h = baselineSetup({ service: { selectionPolicy: "provider-baseline" }, provider: {
    limiter: { async reserve() { return { status: "denied", reason: "daily-limit" }; } },
  } });
  assert.equal((await h.service.resolve(h.request())).status, "retain-previous-or-unavailable");
  assert.equal(h.provider.network.length, 0);
});

test("same-job baseline reuse preserves provider timestamps and spends no second request", async () => {
  const h = baselineSetup({ bounds: { cacheMaxAgeMs: 5000 }, service: { selectionPolicy: "provider-baseline" } });
  const first = await h.service.resolve(h.request());
  h.setNow(h.clock.now() + 200);
  const second = await h.service.resolve(h.request());
  assert.equal(second.status, "candidate");
  assert.deepEqual(second.candidate.markets["match-result"].timestamps, first.candidate.markets["match-result"].timestamps);
  assert.equal(second.candidate.markets["match-result"].provenance.source.fromCache, true);
  assert.equal(second.requestsDispatched, 0);
  assert.equal(h.provider.network.length, 1);
});

test("a frozen provider-first order captures both receipts without promoting any shadow family", async () => {
  const h = baselineSetup({ service: { selectionPolicy: "provider-baseline" } });
  const result = await h.service.resolve(h.request({ order: "provider-first" }));
  assert.equal(result.status, "candidate");
  const candidate = parseResolvedForecastCandidate(result.candidate);
  assert.equal(candidate.audit.sourceOrder, "provider-first");
  assert.equal(candidate.markets["match-result"].fallback.reason, "provider-baseline");
  assert.equal(candidate.markets["total-goals"].available, false);
  const sources = parseForecastSourceReceipts(result.sources);
  assert.equal(sources.ai.status, "candidate");
  assert.equal(sources.ai.markets.markets["total-goals"].available, true);
  assert.deepEqual(sources.ai.timestamps, {
    generatedAt: h.ai.output.timestamps.generatedAt,
    retrievedAt: h.ai.output.timestamps.retrievedAt,
    providerUpdatedAt: h.ai.output.timestamps.providerUpdatedAt,
  });
  assert.equal(sources["api-football"].status, "candidate");
  const interrupted = h.service.resolveWithoutProvider(h.request({ order: "provider-first" }));
  assert.equal(interrupted.status, "retain-previous-or-unavailable");
  assert.equal(parseForecastSourceReceipts(interrupted.sources).ai.status, "candidate");
  assert.ok(Object.values(interrupted.candidate.markets).every((entry) => !entry.available));
});

test("request source order cannot override the independent provider-baseline binding", async () => {
  const h = baselineSetup({ service: { selectionPolicy: "provider-baseline" } });
  const request = h.request({ order: "ai-first" });
  assert.equal((await h.service.resolve(request)).reason, "not-authorized");
  assert.equal(h.service.resolveWithoutProvider(request).reason, "not-authorized");
  assert.equal(h.provider.network.length, 0);
  assert.equal(h.collected.length, 0);
});
