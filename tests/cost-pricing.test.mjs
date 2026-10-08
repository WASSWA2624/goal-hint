import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { COST_MAX_USD_PICOS, CostInputError, costFingerprint, costIdentity, parseCostAttempt } from "../src/server/cost-control/cost-input.ts";
import { estimateCost, priceCost } from "../src/server/cost-control/cost-pricing.ts";
import { costAttemptTotals, costObservedQuantities } from "../src/server/cost-control/cost-totals.ts";

const NOW = parseUtcInstant("2026-10-09T08:00:00Z");
const quantities = { requests: 1, inputTokens: 1000, outputTokens: 500, billedUnits: 2 };
const rate = () => ({ category: "research", provider: "synthetic-provider", model: null, version: "synthetic-v1", currency: "USD",
  startsAt: NOW, endsAt: NOW + 60_000, usdConversion: { numerator: "1", denominator: "1", evidenceRef: "synthetic-fx-evidence" },
  rounding: "ceil-per-component", billingRule: "measured-usage", evidenceRef: "synthetic-rate-evidence",
  rates: { requests: { amount: "0.001", perUnits: 1 }, inputTokens: { amount: "0.02", perUnits: 1_000_000 },
    outputTokens: { amount: "0.04", perUnits: 1_000_000 }, billedUnits: { amount: "0.1", perUnits: 1000 } } });

test("exact estimates combine independent billed components without floating point", () => {
  const estimate = estimateCost(rate(), quantities);
  assert.equal(estimate.kind, "estimated");
  assert.equal(estimate.usdPicos, 1_240_000_000n); assert.equal(estimate.usd, "0.001240000000");
  assert.deepEqual(estimate.components, { requests: 1_000_000_000n, inputTokens: 20_000_000n, outputTokens: 20_000_000n, billedUnits: 200_000_000n });
  assert.ok(Object.isFrozen(estimate.components));
});

test("conservative rounding happens per component at the ledger's twelve decimal places", () => {
  const value = rate();
  for (const field of Object.keys(value.rates)) value.rates[field] = { amount: "0.000000000001", perUnits: 3 };
  assert.equal(priceCost(value, { requests: 1, inputTokens: 1, outputTokens: 1, billedUnits: 1 }), 4n);
  assert.equal(priceCost(value, { requests: 3, inputTokens: 3, outputTokens: 3, billedUnits: 3 }), 4n);
});

test("verified explicit rational conversions support non-USD cards without guessed FX", () => {
  const value = rate(); value.currency = "EUR";
  value.usdConversion = { numerator: "123", denominator: "100", evidenceRef: "synthetic-fx-evidence" };
  assert.equal(priceCost(value, quantities), 1_525_200_000n);
  const fractional = rate(); fractional.currency = "UGX";
  fractional.usdConversion = { numerator: "1", denominator: "3700", evidenceRef: "synthetic-fx-evidence" };
  fractional.rates.requests = { amount: "1", perUnits: 1 };
  assert.equal(priceCost(fractional, { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }), 270_270_271n);
});

test("missing prices are unpriced while explicitly approved zero is arithmetic zero", () => {
  const value = rate(); value.rates.requests = null;
  assert.throws(() => priceCost(value, quantities), (error) => error instanceof CostInputError && error.reason === "unpriced");
  value.rates.requests = { amount: "0", perUnits: 1 };
  assert.equal(priceCost(value, { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }), 0n);
  value.rates.billedUnits = null;
  assert.equal(priceCost(value, { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }), 0n);
  assert.throws(() => priceCost(value, { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 1 }), (error) => error.reason === "unpriced");
});

test("SQL amount overflow is rejected before a reservation can truncate", () => {
  const value = rate(); value.rates.requests = { amount: "99999999999999999999999999.999999999999", perUnits: 1 };
  assert.equal(priceCost(value, { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }), COST_MAX_USD_PICOS);
  assert.throws(() => priceCost(value, { requests: 2, inputTokens: 0, outputTokens: 0, billedUnits: 0 }), (error) => error.reason === "invalid-pricing");
  assert.throws(() => priceCost(value, { requests: 1, inputTokens: 1, outputTokens: 0, billedUnits: 0 }), (error) => error.reason === "invalid-pricing");
});

function reservedAttempt() {
  const identity = (value) => costIdentity("synthetic-test", value);
  const request = { accountId: identity("account"), category: "research", attemptId: identity("attempt"), jobId: identity("job"),
    provider: "synthetic-provider", model: null, rateVersion: "synthetic-v1", maximum: quantities,
    timeoutMs: 10_000, priority: { kind: "background" }, evidenceRef: "synthetic-approval-evidence" };
  const maximumCostUsdPicos = priceCost(rate(), quantities);
  return { request, requestFingerprint: costFingerprint(request), rate: rate(), state: "reserved", queuedAt: NOW, reservedAt: NOW,
    dispatchedAt: null, completedAt: null, launchBefore: NOW + 1000, periodId: identity("period"), ownerToken: identity("owner"),
    maximumCostUsdPicos, liabilityUsdPicos: maximumCostUsdPicos, estimatedUsdPicos: maximumCostUsdPicos,
    observedUsdPicos: null, invoicedUsdPicos: null, usage: null, reconciliationFingerprint: null, reconciliations: [] };
}
function reconcile(attempt, input) {
  const usage = { attemptId: attempt.request.attemptId, reconciliationId: costIdentity("synthetic-test", `reconciliation-${attempt.reconciliations.length}`),
    kind: "partial", observedQuantities: null, elapsedMs: 3000, observedUsdPicos: null, invoicedUsdPicos: null,
    observedAt: NOW + 3000, evidenceRef: "synthetic-usage-evidence", ...input };
  const fingerprint = costFingerprint(usage);
  attempt.reconciliations.push({ id: usage.reconciliationId, fingerprint, usage });
  attempt.usage = usage; attempt.reconciliationFingerprint = fingerprint;
  return usage;
}

test("durable projections hold conservative quantities and time until usage is complete", () => {
  const attempt = reservedAttempt();
  assert.equal(costAttemptTotals(attempt).requests, 1n);
  assert.equal(costAttemptTotals(attempt).elapsedMs, 10_000n);
  attempt.state = "uncertain"; attempt.dispatchedAt = NOW;
  reconcile(attempt, { observedQuantities: { requests: 1, inputTokens: 100, outputTokens: 10, billedUnits: 1 } });
  assert.equal(costAttemptTotals(attempt).inputTokens, 1000n);
  assert.equal(costAttemptTotals(attempt).liabilityUsdPicos, attempt.maximumCostUsdPicos);
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 0, inputTokens: 200, outputTokens: 30, billedUnits: 1 },
    elapsedMs: 5000, observedAt: NOW + 5000 });
  attempt.state = "completed"; attempt.completedAt = NOW + 5000;
  attempt.estimatedUsdPicos = priceCost(attempt.rate, costObservedQuantities(attempt.reconciliations)); attempt.liabilityUsdPicos = attempt.estimatedUsdPicos;
  const totals = costAttemptTotals(attempt);
  assert.equal(totals.requests, 1n); assert.equal(totals.inputTokens, 200n); assert.equal(totals.elapsedMs, 5000n);
  assert.equal(totals.observedUsdPicos, 0n); assert.equal(totals.invoicedUsdPicos, 0n);
  assert.equal(totals.hasOverage, false);
});

test("known overage remains visible when later usage reports smaller counts", () => {
  const attempt = reservedAttempt(); attempt.state = "uncertain"; attempt.dispatchedAt = NOW;
  const partial = reconcile(attempt, { observedQuantities: { requests: 1, inputTokens: 2000, outputTokens: 50, billedUnits: 4 }, elapsedMs: 11_000 });
  attempt.liabilityUsdPicos = priceCost(attempt.rate, partial.observedQuantities);
  // The provider's larger observed counts must hold both money and operating limits.
  attempt.liabilityUsdPicos = attempt.liabilityUsdPicos > attempt.maximumCostUsdPicos ? attempt.liabilityUsdPicos : attempt.maximumCostUsdPicos;
  const partialTotals = costAttemptTotals(attempt); assert.equal(partialTotals.inputTokens, 2000n); assert.equal(partialTotals.hasOverage, true);
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 1, inputTokens: 100, outputTokens: 10, billedUnits: 1 }, elapsedMs: 5000,
    observedAt: NOW + 11_000 });
  attempt.state = "completed"; attempt.completedAt = NOW + 11_000;
  attempt.estimatedUsdPicos = priceCost(attempt.rate, costObservedQuantities(attempt.reconciliations)); attempt.liabilityUsdPicos = attempt.estimatedUsdPicos;
  const totals = costAttemptTotals(attempt); assert.equal(totals.inputTokens, 2000n); assert.equal(totals.elapsedMs, 11_000n);
  assert.equal(totals.hasOverage, true);
});

test("only confirmed pre-dispatch cancellation removes liability and operating quantities", () => {
  const attempt = reservedAttempt(); attempt.state = "canceled"; attempt.liabilityUsdPicos = 0n; attempt.estimatedUsdPicos = null;
  const totals = costAttemptTotals(attempt); assert.equal(totals.requests, 0n); assert.equal(totals.elapsedMs, 0n);
  assert.equal(totals.liabilityUsdPicos, 0n); assert.equal(totals.attemptCount, 1n);
  assert.throws(() => parseCostAttempt({ ...attempt, dispatchedAt: NOW }), CostInputError);
  assert.throws(() => parseCostAttempt({ ...attempt, liabilityUsdPicos: 1n }), CostInputError);
});

test("persistence rejects forged fingerprints, reservation amounts and unsafe lifecycle transitions", () => {
  const attempt = reservedAttempt(); assert.ok(Object.isFrozen(parseCostAttempt(attempt)));
  assert.throws(() => parseCostAttempt({ ...attempt, requestFingerprint: costIdentity("synthetic-test", "forged") }), CostInputError);
  assert.throws(() => parseCostAttempt({ ...attempt, liabilityUsdPicos: 0n }), CostInputError);
  assert.throws(() => parseCostAttempt({ ...attempt, state: "completed", completedAt: NOW + 1000 }), CostInputError);
  const altered = { ...attempt, maximumCostUsdPicos: 1n, liabilityUsdPicos: 1n, estimatedUsdPicos: 1n };
  assert.throws(() => costAttemptTotals(altered), CostInputError);
  assert.throws(() => parseCostAttempt({ ...attempt, rawPrompt: "synthetic-private-key" }), CostInputError);
});

test("unexpected unpriced usage remains durable and blocks further paid attempts", () => {
  const attempt = reservedAttempt();
  attempt.rate.rates.billedUnits = null;
  attempt.request.maximum = { ...quantities, billedUnits: 0 };
  attempt.requestFingerprint = costFingerprint(attempt.request);
  attempt.maximumCostUsdPicos = priceCost(attempt.rate, attempt.request.maximum);
  attempt.liabilityUsdPicos = attempt.maximumCostUsdPicos;
  attempt.estimatedUsdPicos = attempt.maximumCostUsdPicos;
  attempt.state = "uncertain"; attempt.dispatchedAt = NOW;
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 2 } });
  const totals = costAttemptTotals(attempt);
  assert.equal(totals.billedUnits, 2n); assert.equal(totals.liabilityUsdPicos, attempt.maximumCostUsdPicos);
  assert.equal(totals.hasOverage, true);
});

test("a final invoice cannot invent missing token or elapsed usage measurements", () => {
  const attempt = reservedAttempt(); attempt.state = "completed"; attempt.dispatchedAt = NOW; attempt.completedAt = NOW + 3000;
  reconcile(attempt, { kind: "complete", observedQuantities: null, invoicedUsdPicos: 100n, elapsedMs: 0 });
  attempt.liabilityUsdPicos = 100n; attempt.invoicedUsdPicos = 100n;
  const totals = costAttemptTotals(attempt);
  assert.equal(totals.liabilityUsdPicos, 100n); assert.equal(totals.inputTokens, 1000n); assert.equal(totals.elapsedMs, 10_000n);
  assert.equal(totals.requests, 1n); assert.equal(totals.invoicedUsdPicos, 100n);
});

test("separate receipts preserve component maxima without multiplying one physical request", () => {
  const attempt = reservedAttempt(); attempt.state = "uncertain"; attempt.dispatchedAt = NOW;
  reconcile(attempt, { observedQuantities: { requests: 1, inputTokens: 900, outputTokens: 0, billedUnits: 0 } });
  reconcile(attempt, { observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 450, billedUnits: 1 }, observedAt: NOW + 4000 });
  const known = costObservedQuantities(attempt.reconciliations);
  assert.deepEqual(known, { requests: 1, inputTokens: 900, outputTokens: 450, billedUnits: 1 });
  assert.equal(costAttemptTotals(attempt).requests, 1n);
  assert.equal(costObservedQuantities([]), null);
});

test("latest usage follows its original source timestamp while older receipts remain attributable", () => {
  const attempt = reservedAttempt(); attempt.state = "completed"; attempt.dispatchedAt = NOW; attempt.completedAt = NOW + 5000;
  const newer = reconcile(attempt, { kind: "complete", observedAt: NOW + 4000, observedQuantities: { requests: 1, inputTokens: 800, outputTokens: 300, billedUnits: 1 } });
  const selected = attempt.reconciliations[0];
  reconcile(attempt, { kind: "complete", observedAt: NOW + 3000, observedQuantities: { requests: 1, inputTokens: 10, outputTokens: 20, billedUnits: 0 } });
  attempt.usage = newer; attempt.reconciliationFingerprint = selected.fingerprint;
  const parsed = parseCostAttempt(attempt);
  assert.equal(parsed.usage.observedAt, NOW + 4000); assert.equal(parsed.reconciliations.at(-1).usage.observedAt, NOW + 3000);
  assert.throws(() => parseCostAttempt({ ...attempt, usage: attempt.reconciliations.at(-1).usage,
    reconciliationFingerprint: attempt.reconciliations.at(-1).fingerprint }), CostInputError);
  const equal = reconcile(attempt, { kind: "complete", observedAt: NOW + 4000, observedQuantities: { requests: 1, inputTokens: 800, outputTokens: 300, billedUnits: 1 } });
  assert.equal(parseCostAttempt(attempt).usage.reconciliationId, equal.reconciliationId);
});

test("completed monetary projections cannot release previously known spend without an actual billing receipt", () => {
  const attempt = reservedAttempt(); attempt.state = "completed"; attempt.dispatchedAt = NOW; attempt.completedAt = NOW + 5000;
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 1, inputTokens: 500, outputTokens: 300, billedUnits: 1 } });
  const estimate = priceCost(attempt.rate, costObservedQuantities(attempt.reconciliations));
  attempt.estimatedUsdPicos = estimate; attempt.liabilityUsdPicos = estimate - 1n;
  assert.throws(() => costAttemptTotals(attempt), CostInputError);
  attempt.liabilityUsdPicos = estimate; assert.equal(costAttemptTotals(attempt).liabilityUsdPicos, estimate);
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 1, inputTokens: 500, outputTokens: 300, billedUnits: 1 },
    observedUsdPicos: 10n, observedAt: NOW + 4000 });
  attempt.observedUsdPicos = 10n; attempt.liabilityUsdPicos = 10n;
  assert.equal(costAttemptTotals(attempt).liabilityUsdPicos, 10n);
});

test("an invoice-required card keeps its entire reservation until an invoice is present", () => {
  const attempt = reservedAttempt(); attempt.rate.billingRule = "invoice-required";
  attempt.state = "completed"; attempt.dispatchedAt = NOW; attempt.completedAt = NOW + 5000;
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 0, inputTokens: 0, outputTokens: 0, billedUnits: 0 },
    observedUsdPicos: 0n });
  attempt.observedUsdPicos = 0n; attempt.liabilityUsdPicos = 0n;
  assert.throws(() => costAttemptTotals(attempt), CostInputError);
  attempt.liabilityUsdPicos = attempt.maximumCostUsdPicos;
  assert.equal(costAttemptTotals(attempt).liabilityUsdPicos, attempt.maximumCostUsdPicos);
  reconcile(attempt, { kind: "complete", observedQuantities: { requests: 0, inputTokens: 0, outputTokens: 0, billedUnits: 0 },
    invoicedUsdPicos: 0n, observedAt: NOW + 4000 });
  attempt.invoicedUsdPicos = 0n; attempt.liabilityUsdPicos = 0n;
  assert.equal(costAttemptTotals(attempt).liabilityUsdPicos, 0n);
});
