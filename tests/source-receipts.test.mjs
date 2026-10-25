import assert from "node:assert/strict";
import test from "node:test";
import { evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { resolveFallbackCandidate } from "../src/server/fallback/fallback-resolution.ts";
import { forecastSourceReceipts, parseForecastSourceReceipts } from "../src/server/fallback/source-receipts.ts";
import { fallbackAiDenied, fallbackFixture, fallbackProvider } from "./helpers/fallback-fixtures.mjs";

// Synthetic forecasts only; receipts are pure records of what each source returned in one refresh.
const receiptsFor = (fixture, provider, now = fixture.now) => {
  const result = resolveFallbackCandidate({ expected: fixture.expected, ai: fixture.ai, provider, now, order: "provider-first" }, fixture.authority);
  return forecastSourceReceipts({ ai: fixture.ai, provider, audit: result.candidate.audit, order: "provider-first" });
};
const stored = (value) => JSON.parse(evidenceSerialize(value));

test("a current AI candidate and an authorized provider each keep their own single-source snapshot", () => {
  const fixture = fallbackFixture(), provider = fallbackProvider(fixture.expected), receipts = receiptsFor(fixture, provider);
  assert.equal(receipts.version, 1); assert.equal(receipts.order, "provider-first");
  assert.deepEqual(receipts.ai, { source: "ai", status: "candidate", reason: null, markets: fixture.ai.output.markets,
    timestamps: { generatedAt: fixture.ai.output.timestamps.generatedAt, retrievedAt: fixture.ai.output.timestamps.retrievedAt,
      providerUpdatedAt: fixture.ai.output.timestamps.providerUpdatedAt },
    version: fixture.ai.output.schemaVersion, modelVersionId: fixture.ai.output.modelVersionId,
    evidence: { conflicting: false, limitedNews: fixture.ai.output.evidence.coverage.limitedNews } });
  const api = receipts["api-football"];
  assert.equal(api.status, "candidate"); assert.equal(api.version, "synthetic-provider-v1");
  assert.strictEqual(api.markets, provider.candidate.markets); assert.deepEqual(api.timestamps, provider.candidate.timestamps);
  for (const family of ["total-goals", "both-teams-to-score"]) assert.deepEqual(api.markets.markets[family], { available: false, reason: "unsupported-family" });
  for (const source of ["ai", "api-football"]) assert.ok(Object.values(receipts[source].markets.markets).every((market) => !market.available || market.market.source === source));
  assert.deepEqual(parseForecastSourceReceipts(stored(receipts)), stored(receipts));
});

test("expired AI and refused sources are explicit unavailable receipts with no probability filled", () => {
  const fixture = fallbackFixture(), boundary = fixture.ai.output.timestamps.generatedAt + fixture.ai.output.outputTiming.maxAgeMs + 1;
  const expired = receiptsFor(fixture, fallbackProvider(fixture.expected), boundary);
  assert.deepEqual([expired.ai.status, expired.ai.reason], ["unavailable", "invalid-timing"]);
  const denied = fallbackFixture(); denied.ai = fallbackAiDenied("budget-exhausted"); denied.expected = { ...denied.expected, pin: null };
  const none = receiptsFor(denied, { status: "denied", reason: "quota-denied", requestsDispatched: 0, requestCountUnknown: false });
  assert.deepEqual([none.ai.reason, none["api-football"].reason], ["budget-exhausted", "quota-denied"]);
  for (const receipt of [expired.ai, none.ai, none["api-football"]]) {
    assert.ok(Object.values(receipt.markets.markets).every((market) => market.available === false));
    assert.deepEqual([receipt.timestamps, receipt.version, receipt.modelVersionId, receipt.evidence], [null, null, null, null]);
  }
  const unrequested = forecastSourceReceipts({ ai: denied.ai, provider: null, order: "ai-first",
    audit: { aiStatus: "denied", aiReason: "budget-exhausted", providerStatus: "not-requested", providerReason: null } });
  assert.equal(unrequested["api-football"].reason, "not-requested"); assert.equal(unrequested.order, "ai-first");
  parseForecastSourceReceipts(stored(unrequested));
});

test("a provider the resolver refused is unavailable even when the raw result was a candidate", () => {
  const fixture = fallbackFixture(), provider = fallbackProvider(fixture.expected);
  const receipts = forecastSourceReceipts({ ai: fixture.ai, provider, order: "provider-first",
    audit: { aiStatus: "candidate", aiReason: null, providerStatus: "denied", providerReason: "not-authorized" } });
  assert.deepEqual([receipts["api-football"].status, receipts["api-football"].reason], ["unavailable", "not-authorized"]);
});

test("conflicting and limited-news flags come from the AI evidence missingness and coverage", () => {
  const fixture = fallbackFixture(), evidence = fixture.ai.output.evidence;
  const plain = forecastSourceReceipts({ ai: { ...fixture.ai, output: { ...fixture.ai.output, evidence: { ...evidence,
    coverage: { ...evidence.coverage, limitedNews: false }, missingness: [] } } }, provider: null, order: "provider-first",
  audit: { aiStatus: "candidate", aiReason: null, providerStatus: "not-requested", providerReason: null } });
  assert.deepEqual(plain.ai.evidence, { conflicting: false, limitedNews: false });
  const ai = { ...fixture.ai, output: { ...fixture.ai.output, evidence: { ...evidence,
    coverage: { ...evidence.coverage, limitedNews: true },
    missingness: [...evidence.missingness, { kind: "injury", subjectTeamId: null, reason: "conflicting" }] } } };
  const receipts = forecastSourceReceipts({ ai, provider: null, order: "provider-first",
    audit: { aiStatus: "candidate", aiReason: null, providerStatus: "not-requested", providerReason: null } });
  assert.deepEqual(receipts.ai.evidence, { conflicting: true, limitedNews: true });
});

test("the archive parser rejects mixed sources, extra keys and incoherent status", () => {
  const fixture = fallbackFixture(), receipts = stored(receiptsFor(fixture, fallbackProvider(fixture.expected)));
  const change = (edit) => { const value = structuredClone(receipts); edit(value); return value; };
  for (const invalid of [
    change((value) => { value.ai.markets = value["api-football"].markets; }),
    change((value) => { value["api-football"].markets = value.ai.markets; }),
    change((value) => { value.extra = true; }),
    change((value) => { value.ai.probability = 0.5; }),
    change((value) => { value.ai.status = "unavailable"; value.ai.reason = "timeout"; }),
    change((value) => { value["api-football"].reason = "stale"; }),
    change((value) => { value["api-football"].modelVersionId = value.ai.modelVersionId; }),
    change((value) => { value.ai.evidence = null; }),
    change((value) => { value.ai.reason = "private arbitrary error text"; value.ai.status = "unavailable"; }),
    change((value) => { value.order = "provider-only"; }),
    change((value) => { value.version = 2; }),
  ]) assert.throws(() => parseForecastSourceReceipts(invalid));
  const denied = stored(receiptsFor({ ...fixture, now: fixture.ai.output.timestamps.generatedAt + fixture.ai.output.outputTiming.maxAgeMs + 1 },
    fallbackProvider(fixture.expected)));
  parseForecastSourceReceipts(denied);
  denied.ai.markets = receipts.ai.markets;
  assert.throws(() => parseForecastSourceReceipts(denied), "an unavailable receipt never carries an available market");
});
