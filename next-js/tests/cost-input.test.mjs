import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { COST_MAX_USD_PICOS, CostInputError, costIdentity, costFingerprint, costUsdDecimal, costUsdPicosFromCents,
  costUsdPicosFromDecimal, parseCostAmount, parseCostJob, parseCostPeriod, parseCostPermit, parseCostRate,
  parseCostRequest, parseCostUsage } from "../src/server/cost-control/cost-input.ts";

// Synthetic policy and pricing fixtures do not authorize a live paid service.
const NOW = parseUtcInstant("2026-10-09T08:00:00Z");
const id = (value) => costIdentity("synthetic-test", value);
const base = { accountId: id("account"), category: "ai", evidenceRef: "synthetic-approval" };
const period = () => ({ ...base, periodId: id("period"), startsAt: NOW, endsAt: NOW + 86_400_000,
  capUsdPicos: 1_000_000_000_000n, openingChargedUsdPicos: 0n });
const job = () => ({ ...base, jobId: id("job"), workKey: id("work"), costCapUsdPicos: 100_000_000_000n,
  requestLimit: 3, inputTokenLimit: 1000, outputTokenLimit: 100, billedUnitLimit: 0, startsAt: NOW,
  deadlineAt: NOW + 60_000, timeLimitMs: 50_000, fallbackReserveMs: 10_000 });
const rate = () => ({ category: "ai", provider: "synthetic-provider", model: "synthetic-model", version: "synthetic-rate-v1",
  currency: "USD", startsAt: NOW, endsAt: NOW + 86_400_000, usdConversion: { numerator: "1", denominator: "1", evidenceRef: "synthetic-fx" },
  rounding: "ceil-per-component", billingRule: "measured-usage", rates: { requests: { amount: "0.001", perUnits: 1 },
    inputTokens: { amount: "0.001", perUnits: 1000 }, outputTokens: { amount: "0.002", perUnits: 1000 }, billedUnits: null },
  evidenceRef: "synthetic-rate-evidence" });
const request = () => ({ ...base, attemptId: id("attempt"), jobId: id("job"), rateVersion: "synthetic-rate-v1",
  provider: "synthetic-provider", model: "synthetic-model", maximum: { requests: 1, inputTokens: 100, outputTokens: 50, billedUnits: 0 },
  timeoutMs: 10_000, priority: { kind: "fixture", kickoffAt: NOW + 3_600_000 } });
const usage = () => ({ attemptId: id("attempt"), reconciliationId: id("reconciliation"), kind: "complete",
  observedQuantities: { requests: 1, inputTokens: 50, outputTokens: 20, billedUnits: 0 }, elapsedMs: 2000,
  observedUsdPicos: null, invoicedUsdPicos: null, observedAt: NOW + 2000, evidenceRef: "synthetic-usage-evidence" });
const invalid = (error) => error instanceof CostInputError && !error.message.includes("synthetic-private-key");

test("USD accounting conversions remain exact through the full SQL precision", () => {
  assert.equal(costUsdPicosFromDecimal("0.000000000001"), 1n);
  assert.equal(costUsdPicosFromDecimal("1.234567890123"), 1_234_567_890_123n);
  assert.equal(costUsdDecimal(COST_MAX_USD_PICOS), "99999999999999999999999999.999999999999");
  assert.equal(costUsdPicosFromDecimal(costUsdDecimal(COST_MAX_USD_PICOS)), COST_MAX_USD_PICOS);
  assert.equal(costUsdPicosFromCents(3), 30_000_000_000n);
  for (const value of [0.1, "0.0000000000001", "1e-6", "01", "-1", "+1", " 1", "1.", "100000000000000000000000000"]) {
    assert.throws(() => costUsdPicosFromDecimal(value), invalid);
  }
  for (const value of [3.5, -1, Number.MAX_SAFE_INTEGER + 1, "3", undefined]) assert.throws(() => costUsdPicosFromCents(value), invalid);
  assert.throws(() => parseCostAmount(1), invalid);
  assert.throws(() => parseCostAmount(-1n), invalid);
});

test("policy contracts require explicit independent caps, periods and immutable job bounds", () => {
  const parsed = parseCostPeriod(period()); assert.equal(parsed.category, "ai"); assert.ok(Object.isFrozen(parsed));
  assert.equal(parseCostPeriod({ ...period(), category: "research" }).category, "research");
  assert.equal(parseCostPeriod({ ...period(), capUsdPicos: 0n }).capUsdPicos, 0n);
  assert.equal(parseCostPeriod({ ...period(), openingChargedUsdPicos: 2_000_000_000_000n }).openingChargedUsdPicos, 2_000_000_000_000n);
  assert.equal(parseCostJob(job()).fallbackReserveMs, 10_000);
  for (const changes of [{ capUsdPicos: undefined }, { openingChargedUsdPicos: undefined },
    { category: "football" }, { periodId: "synthetic-raw-account" }, { endsAt: NOW }, { evidenceRef: "synthetic-private-key\n" }]) {
    assert.throws(() => parseCostPeriod({ ...period(), ...changes }), invalid);
  }
  for (const changes of [{ requestLimit: undefined }, { timeLimitMs: 0 }, { fallbackReserveMs: undefined }, { fallbackReserveMs: 50_000 },
    { requestLimit: 1.5 }, { inputTokenLimit: -1 }, { costCapUsdPicos: "0.01" }, { workKey: "unhashed-job" }, { deadlineAt: NOW }]) {
    assert.throws(() => parseCostJob({ ...job(), ...changes }), invalid);
  }
});

test("rate cards require versioned prices, explicit currency conversion and billing rules", () => {
  const parsed = parseCostRate(rate()); assert.equal(parsed.rates.requests.amount, "0.001000000000");
  assert.ok(Object.isFrozen(parsed.rates));
  for (const changes of [{ currency: undefined }, { currency: "usd" }, { version: undefined }, { rounding: undefined },
    { billingRule: undefined }, { endsAt: NOW }, { usdConversion: { numerator: "0", denominator: "1", evidenceRef: "synthetic-fx" } },
    { usdConversion: { numerator: "2", denominator: "1", evidenceRef: "synthetic-fx" } }, { evidenceRef: "https://evidence.example.test/?key=synthetic-private-key" }]) {
    assert.throws(() => parseCostRate({ ...rate(), ...changes }), invalid);
  }
  assert.throws(() => parseCostRate({ ...rate(), rates: { ...rate().rates, requests: { amount: 0.01, perUnits: 1 } } }), invalid);
  assert.throws(() => parseCostRate({ ...rate(), rates: { ...rate().rates, requests: { amount: "0.01", perUnits: 0 } } }), invalid);
});

test("one-attempt request contracts reject retries hidden within a reservation", () => {
  assert.equal(parseCostRequest(request()).maximum.requests, 1);
  assert.equal(parseCostRequest({ ...request(), priority: { kind: "background" } }).priority.kind, "background");
  for (const changes of [{ maximum: { ...request().maximum, requests: 2 } }, { timeoutMs: 0 }, { timeoutMs: 2_147_483_648 },
    { maximum: { ...request().maximum, outputTokens: Number.MAX_SAFE_INTEGER + 1 } }, { provider: "provider?key=synthetic-private-key" },
    { priority: { kind: "nearest" } }, { priority: { kind: "fixture" } }, { priority: { kind: "background", kickoffAt: NOW } }]) {
    assert.throws(() => parseCostRequest({ ...request(), ...changes }), invalid);
  }
});

test("usage distinguishes unknown and partial observations from complete evidence", () => {
  assert.equal(parseCostUsage(usage()).observedAt, NOW + 2000);
  assert.equal(parseCostUsage({ ...usage(), kind: "unknown", observedQuantities: null }).kind, "unknown");
  assert.equal(parseCostUsage({ ...usage(), observedQuantities: null, invoicedUsdPicos: 10n }).invoicedUsdPicos, 10n);
  for (const changes of [{ observedQuantities: null }, { observedAt: NOW + 0.5 }, { invoicedUsdPicos: 0.01 }, { elapsedMs: -1 },
    { rawResponse: "synthetic-private-key" }, { observedQuantities: { ...usage().observedQuantities, requests: 2 } }]) {
    assert.throws(() => parseCostUsage({ ...usage(), ...changes }), invalid);
  }
});

test("hashed identities and semantic fingerprints keep amounts and source times distinct", () => {
  assert.equal(costIdentity("synthetic-test", "private-provider-account").length, 64);
  assert.notEqual(costIdentity("ai", "same-account"), costIdentity("research", "same-account"));
  assert.notEqual(costIdentity("synthetic-test", "a", "bc"), costIdentity("synthetic-test", "ab", "c"));
  assert.equal(costFingerprint({ a: 1n, b: 2 }), costFingerprint({ b: 2, a: 1n }));
  assert.notEqual(costFingerprint({ a: 1n }), costFingerprint({ a: "1" }));
  assert.notEqual(costFingerprint(usage()), costFingerprint({ ...usage(), observedAt: NOW + 2001 }));
  assert.throws(() => costIdentity("Synthetic", "account"), invalid);
  assert.throws(() => parseCostRequest({ ...request(), apiKey: "synthetic-private-key" }), invalid);
});

test("permit fences require canonical private identities and an increasing dispatch window", () => {
  const permit = { attemptId: id("attempt"), jobId: id("job"), periodId: id("period"), ownerToken: id("owner"),
    reservedAt: NOW, launchBefore: NOW + 1000, maximumCostUsdPicos: 100n };
  assert.equal(parseCostPermit(permit).ownerToken, id("owner"));
  assert.throws(() => parseCostPermit({ ...permit, launchBefore: NOW }), invalid);
  assert.throws(() => parseCostPermit({ ...permit, ownerToken: "untrusted" }), invalid);
  assert.throws(() => parseCostPermit({ ...permit, maximumCostUsdPicos: -1n }), invalid);
});
