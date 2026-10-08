import assert from "node:assert/strict";
import test from "node:test";
import { marketRules } from "../src/domain/markets.ts";
import { evidenceHash } from "./helpers/evidence-fixtures.mjs";
import { fallbackAuthority, fallbackAiDenied, fallbackFixture, fallbackProvider } from "./helpers/fallback-fixtures.mjs";
import { fallbackRequestedGroups, isFallbackAiCurrent, resolveFallbackCandidate } from "../src/server/fallback/fallback-resolution.ts";
import { parseFallbackAiResult, parseFallbackContext, parseProviderFallbackResult } from "../src/server/fallback/fallback-input.ts";

const noProvider = (fixture = fallbackFixture()) => resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai, provider: null, now: fixture.now }, fixture.authority);
const resolve = (fixture, provider, authority = fixture.authority) => resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai,
  provider, now: fixture.now }, authority);
const partial = (groups) => fallbackFixture({ output: { groups } });
const total = (over = 0.6) => ({ period: marketRules.period, line: 2.5, probabilities: { "over-2.5": over, "under-2.5": 1 - over } });
const btts = (yes = 0.6) => ({ period: marketRules.period, probabilities: { yes, no: 1 - yes } });

test("valid AI takes priority over every competing provider percentage and preserves evidence explanations", () => {
  const fixture = fallbackFixture(), result = resolve(fixture, fallbackProvider(fixture.expected));
  assert.equal(result.status, "candidate");
  assert.deepEqual(fallbackRequestedGroups(fixture.ai), []);
  for (const value of Object.values(result.candidate.markets)) { assert.equal(value.available, true); assert.equal(value.market.source, "ai"); assert.equal(value.fallback, null); }
  assert.equal(result.candidate.markets["match-result"].market.probabilities["home-win"], 0.4);
  assert.equal(result.candidate.reasons[0].text, fixture.ai.output.reasons[0].text);
  assert.match(result.candidate.uncertainty.text, /Player availability is missing/u);
  assert.deepEqual(result.candidate.markets["match-result"].provenance.calibration, fixture.ai.output.calibration);
  assert.strictEqual(result.candidate.markets["match-result"].provenance.evidence, fixture.ai.output.evidence);
  assert.strictEqual(result.candidate.markets["match-result"].provenance.outputTiming, fixture.ai.output.outputTiming);
});

test("provider result and double chance replace one missing AI source group together", () => {
  const fixture = partial({ "match-result": null, "total-goals": total(), "both-teams-to-score": btts() });
  const provider = fallbackProvider(fixture.expected), result = resolve(fixture, provider);
  assert.equal(result.status, "candidate"); assert.deepEqual(fallbackRequestedGroups(fixture.ai), ["match-result"]);
  const match = result.candidate.markets["match-result"], chance = result.candidate.markets["double-chance"];
  assert.equal(match.market.source, "api-football"); assert.equal(chance.market.source, "api-football");
  assert.deepEqual(chance.market.probabilities, { "home-or-draw": 0.8, "away-or-draw": 0.5, "home-or-away": 0.7 });
  assert.strictEqual(match.provenance, chance.provenance); assert.strictEqual(match.timestamps, chance.timestamps);
  assert.deepEqual(match.fallback, { reason: "ai-missing-group", detail: "missing-group" });
  assert.equal(result.candidate.markets["total-goals"].market.source, "ai");
  assert.equal(result.candidate.reasons.length, 3); assert.match(result.candidate.reasons[2].text, /API-Football/u);
});

for (const [reason, trigger] of [["timeout", "ai-timeout"], ["insufficient-evidence", "ai-insufficient-evidence"],
  ["budget-exhausted", "ai-budget-exhausted"], ["invalid-output", "ai-failure"], ["unconfigured", "ai-failure"]]) {
  test(`approved AI ${reason} can use provider fallback with an auditable trigger`, () => {
    const fixture = fallbackFixture(); fixture.ai = fallbackAiDenied(reason); fixture.expected = { ...fixture.expected, pin: null };
    const result = resolve(fixture, fallbackProvider(fixture.expected));
    assert.equal(result.status, "candidate"); assert.deepEqual(result.candidate.markets["match-result"].fallback, { reason: trigger, detail: reason });
    assert.equal(result.candidate.audit.aiReason, reason); assert.equal(result.candidate.markets["total-goals"].available, false);
    assert.equal(result.candidate.markets["total-goals"].reason, "unsupported-family");
  });
}

test("invalid incomplete AI values never mix with a complete provider distribution", () => {
  const fixture = partial({ "match-result": { period: marketRules.period, probabilities: { "home-win": 0.9 } }, "total-goals": total() });
  const result = resolve(fixture, fallbackProvider(fixture.expected));
  assert.equal(result.status, "candidate"); assert.deepEqual(result.candidate.markets["match-result"].market.probabilities,
    { "home-win": 0.5, draw: 0.3, "away-win": 0.2 });
  assert.deepEqual(result.candidate.markets["match-result"].fallback, { reason: "ai-invalid-group", detail: "incomplete-group" });
});

test("mixed-source conflict preserves AI and omits the provider result and double chance", () => {
  const fixture = partial({ "total-goals": total(0.1), "both-teams-to-score": btts(0.8) });
  const provider = fallbackProvider(fixture.expected, { groups: { "match-result": { source: "api-football", period: marketRules.period,
    probabilities: { "home-win": 0.8, draw: 0.05, "away-win": 0.15 } } } });
  const result = resolve(fixture, provider); assert.equal(result.status, "candidate");
  for (const family of ["match-result", "double-chance"]) assert.deepEqual(result.candidate.markets[family], { available: false, reason: "cross-market-conflict" });
  assert.equal(result.candidate.markets["total-goals"].market.source, "ai"); assert.equal(result.candidate.markets["both-teams-to-score"].market.source, "ai");
  assert.ok(result.candidate.issues.some((issue) => issue.reason === "cross-market-conflict"));
});

test("a fresh partial candidate drops absent groups and never contains old markets", () => {
  const fixture = partial({ "total-goals": total() }), result = noProvider(fixture);
  assert.equal(result.status, "candidate"); assert.equal(result.candidate.markets["total-goals"].available, true);
  for (const family of ["match-result", "double-chance", "both-teams-to-score"]) assert.equal(result.candidate.markets[family].available, false);
  assert.equal(result.candidate.reasons.length, 2);
  assert.equal(resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai, provider: null, now: fixture.now, previous: fallbackFixture().ai.output.markets },
    fixture.authority).reason, "invalid-request");
});

test("zero valid groups gives only the retention instruction, with no synthetic publication", () => {
  const fixture = fallbackFixture(); fixture.ai = fallbackAiDenied("budget-exhausted");
  const result = resolve(fixture, { status: "denied", reason: "quota-denied", requestsDispatched: 0, requestCountUnknown: false });
  assert.equal(result.status, "retain-previous-or-unavailable");
  assert.ok(Object.values(result.candidate.markets).every((value) => value.available === false && value.reason === "quota-denied"));
  assert.equal(result.candidate.reasons.length, 2); assert.ok(!Object.hasOwn(result, "publishedAt"));
});

test("cached provider data retains its original retrieval and unknown generation clocks", () => {
  const fixture = fallbackFixture(); fixture.ai = fallbackAiDenied();
  const original = fallbackProvider(fixture.expected), cached = fallbackProvider(fixture.expected, { requestsDispatched: 0,
    candidate: { provenance: { ...original.candidate.provenance, fromCache: true } } });
  const result = resolve(fixture, cached), selected = result.candidate.markets["match-result"];
  assert.equal(result.status, "candidate"); assert.deepEqual(selected.timestamps, original.candidate.timestamps);
  assert.equal(selected.timestamps.generatedAt, null); assert.equal(selected.timestamps.providerUpdatedAt, null);
  assert.equal(selected.provenance.source.fromCache, true); assert.match(result.candidate.uncertainty.text, /times are unknown/u);
});

test("a fabricated or unowned AI denial cannot authorize fallback", () => {
  const fixture = fallbackFixture(); fixture.ai = fallbackAiDenied();
  const result = resolve(fixture, fallbackProvider(fixture.expected), fallbackAuthority({ verifyAi: () => false }));
  assert.deepEqual(result, { status: "denied", reason: "not-authorized" });
});

test("a provider with the wrong job or refresh context cannot replace any AI group", () => {
  const fixture = partial({ "total-goals": total() });
  for (const changed of [{ provenance: { ...fallbackProvider(fixture.expected).candidate.provenance, jobId: evidenceHash("another-job") } },
    { context: { ...fixture.expected.context, cycleId: "10000000-0000-4000-8000-000000000004" } }]) {
    const result = resolve(fixture, fallbackProvider(fixture.expected, { candidate: changed }));
    assert.equal(result.status, "candidate"); assert.equal(result.candidate.markets["match-result"].available, false);
    assert.equal(result.candidate.markets["match-result"].reason, "wrong-identity"); assert.equal(result.candidate.audit.providerReason, "wrong-identity");
  }
});

test("AI candidate requires its exact pinned model, evidence and fixture version", () => {
  const fixture = fallbackFixture();
  for (const expected of [{ ...fixture.expected, pin: null }, { ...fixture.expected, evidenceHash: evidenceHash("other-evidence") },
    { ...fixture.expected, context: { ...fixture.expected.context, fixtureVersion: 2n } }]) {
    assert.equal(resolveFallbackCandidate({ expected, ai: fixture.ai, provider: null, now: fixture.now }, fixture.authority).reason, "invalid-request");
  }
});

test("cutoff is strict and evidence cutoff remains distinct from forecast generation", () => {
  const fixture = fallbackFixture(), deadline = fixture.expected.context.kickoffAt - 300_000;
  assert.equal(noProvider(fixture).status, "candidate");
  assert.ok(fixture.ai.output.timestamps.generatedAt > fixture.expected.context.cutoffAt);
  assert.equal(resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai, provider: null, now: deadline }, fixture.authority).reason, "ineligible-refresh");
});

test("original AI generation age controls expiry and every expired group needs fallback", () => {
  const fixture = fallbackFixture(), maximumAge = fixture.ai.output.outputTiming.maxAgeMs;
  const boundary = fixture.ai.output.timestamps.generatedAt + maximumAge;
  assert.equal(isFallbackAiCurrent(fixture.ai, boundary), true);
  assert.equal(isFallbackAiCurrent(fixture.ai, boundary + 1), false);
  assert.deepEqual(fallbackRequestedGroups(fixture.ai, boundary + 1), ["match-result", "total-goals", "both-teams-to-score"]);
  const result = resolve({ ...fixture, now: boundary + 1 }, fallbackProvider(fixture.expected));
  assert.equal(result.status, "candidate"); assert.equal(result.candidate.markets["match-result"].market.source, "api-football");
  assert.deepEqual(result.candidate.markets["match-result"].fallback, { reason: "ai-invalid-group", detail: "invalid-timing" });
  assert.equal(result.candidate.audit.aiStatus, "candidate"); assert.equal(result.candidate.audit.aiReason, "invalid-timing");
  assert.equal(result.candidate.markets["total-goals"].available, false);
  const empty = noProvider({ ...fixture, now: boundary + 1 });
  assert.equal(empty.status, "retain-previous-or-unavailable");
  assert.ok(Object.values(empty.candidate.markets).every((value) => value.reason === "invalid-timing"));
});

test("revoked authority and asynchronous proof checks fail closed", async () => {
  const fixture = fallbackFixture();
  for (const overrides of [{ authorize: () => Promise.reject(new Error("private")) }, { verifyContext: () => Promise.resolve(true) },
    { verifyAi: () => Promise.resolve(true) }]) assert.equal(noProvider({ ...fixture, authority: fallbackAuthority(overrides) }).reason, "not-authorized");
  let checks = 0;
  assert.equal(noProvider({ ...fixture, authority: fallbackAuthority({ verifyAi: () => ++checks === 1 }) }).reason, "not-authorized");
  await new Promise((resolve) => setImmediate(resolve));
});

test("provider authorization failure preserves independently valid AI groups", () => {
  const fixture = partial({ "total-goals": total() }), result = resolve(fixture, fallbackProvider(fixture.expected), fallbackAuthority({ verifyProvider: () => false }));
  assert.equal(result.status, "candidate"); assert.equal(result.candidate.markets["total-goals"].available, true);
  assert.equal(result.candidate.markets["match-result"].reason, "not-authorized");
});

test("late provider revocation recomposes once and keeps independently authorized AI", () => {
  const fixture = partial({ "total-goals": total() }); let providerChecks = 0;
  const result = resolve(fixture, fallbackProvider(fixture.expected), fallbackAuthority({ verifyProvider: () => ++providerChecks === 1 }));
  assert.equal(result.status, "candidate"); assert.equal(providerChecks, 2);
  assert.equal(result.candidate.markets["total-goals"].market.source, "ai");
  assert.deepEqual(result.candidate.markets["match-result"], { available: false, reason: "not-authorized" });
  assert.equal(result.candidate.audit.providerReason, "not-authorized");
  assert.ok(result.candidate.reasons.every((reason) => !reason.text.includes("API-Football fallback")));
});

test("late provider revocation without valid AI returns retention and never a revoked market", () => {
  const fixture = fallbackFixture(); fixture.ai = fallbackAiDenied("timeout"); let providerChecks = 0;
  const result = resolve(fixture, fallbackProvider(fixture.expected), fallbackAuthority({ verifyProvider: () => ++providerChecks === 1 }));
  assert.equal(result.status, "retain-previous-or-unavailable"); assert.equal(providerChecks, 2);
  assert.ok(Object.values(result.candidate.markets).every((value) => !value.available && value.reason === "not-authorized"));
});

test("parsers preserve candidate seals while rejecting secret-shaped, invented and unknown fields", () => {
  const fixture = fallbackFixture(), provider = fallbackProvider(fixture.expected);
  assert.strictEqual(parseFallbackAiResult(fixture.ai), fixture.ai); assert.strictEqual(parseProviderFallbackResult(provider), provider);
  assert.equal(parseFallbackContext(fixture.expected).pin.id, fixture.expected.pin.id);
  for (const value of [{ ...provider, requestCountUnknown: undefined }, { ...provider, credential: "secret" },
    { ...provider, candidate: { ...provider.candidate, flags: [] } }, { ...provider, candidate: { ...provider.candidate,
      provenance: { ...provider.candidate.provenance, sourceUrl: "https://127.0.0.1/private" } } }]) assert.throws(() => parseProviderFallbackResult(value));
  assert.throws(() => parseFallbackAiResult({ ...fallbackAiDenied(), reason: "private arbitrary error text" }));
  assert.throws(() => parseFallbackAiResult({ ...fixture.ai, output: { ...fixture.ai.output, exactScore: { home: 2, away: 1 } } }));
});

test("a manufactured direct double chance fails structural source-group validation", () => {
  const fixture = fallbackFixture(), provider = fallbackProvider(fixture.expected), chance = provider.candidate.markets.markets["double-chance"];
  const forged = { ...provider, candidate: { ...provider.candidate, markets: { ...provider.candidate.markets,
    markets: { ...provider.candidate.markets.markets, "double-chance": { ...chance, market: { ...chance.market,
      probabilities: { "home-or-draw": 0.9, "away-or-draw": 0.6, "home-or-away": 0.8 }, selection: "home-or-draw", selectedProbability: 0.9 } } } } } };
  assert.throws(() => parseProviderFallbackResult(forged));
});
