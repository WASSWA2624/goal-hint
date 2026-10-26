import assert from "node:assert/strict";
import test from "node:test";
import { costSummaryRecord } from "../src/server/cost-control/cost-observability.ts";
import { costId, USD } from "./helpers/cost-fixtures.mjs";

test("internal cost telemetry preserves exact values and excludes private payloads", () => {
  const summary = { status: "summary", accountId: costId("account"), category: "ai", periodId: costId("period"),
    capUsdPicos: USD, openingChargedUsdPicos: 0n, liabilityUsdPicos: 1n, remainingUsdPicos: USD - 1n,
    estimatedUsdPicos: 2n, observedUsdPicos: 1n, invoicedUsdPicos: 0n, requests: 1n,
    inputTokens: 9_007_199_254_740_993n, outputTokens: 0n, billedUnits: 0n, elapsedMs: 123n, attemptCount: 1n,
    hasOverage: false, overageBlocked: false, prompt: "PRIVATE_PROMPT", source: "PRIVATE_SOURCE",
    credential: "PRIVATE_KEY", ownerToken: "PRIVATE_PERMIT", error: new Error("PRIVATE_ERROR") };
  const record = costSummaryRecord(summary), encoded = JSON.stringify(record);
  assert.equal(record.liability, "0.000000000001");
  assert.equal(record.estimated, "0.000000000002");
  assert.equal(record.inputTokens, "9007199254740993");
  assert.equal(record.invoiced, "0.000000000000");
  assert.equal(encoded.includes("PRIVATE_"), false);
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => costSummaryRecord({ ...summary, accountId: "PRIVATE_KEY" }), { name: "CostInputError" });
});

test("usage-based telemetry represents no monthly ceiling with null cap and remaining while preserving spending", () => {
  const summary = { status: "summary", accountId: costId("usage-account"), category: "ai", periodId: costId("usage-period"),
    billingMode: "usage-based", capUsdPicos: 0n, openingChargedUsdPicos: 12n * USD,
    liabilityUsdPicos: 15n * USD + 1n, remainingUsdPicos: null, estimatedUsdPicos: 3n * USD,
    observedUsdPicos: 3n * USD + 1n, invoicedUsdPicos: 0n, requests: 3n, inputTokens: 120n,
    outputTokens: 30n, billedUnits: 20n, elapsedMs: 1200n, attemptCount: 3n, hasOverage: false, overageBlocked: false,
    credential: "PRIVATE_USAGE_KEY", prompt: "PRIVATE_USAGE_PROMPT" };
  const record = costSummaryRecord(summary);
  assert.equal(record.billingMode, "usage-based"); assert.equal(record.cap, null); assert.equal(record.remaining, null);
  assert.equal(record.openingCharged, "12.000000000000"); assert.equal(record.liability, "15.000000000001");
  assert.equal(record.observed, "3.000000000001"); assert.equal(record.requests, "3"); assert.equal(record.billedUnits, "20");
  assert.equal(record.overageBlocked, false); assert.equal(JSON.stringify(record).includes("PRIVATE_USAGE_"), false);
  const capped = costSummaryRecord({ ...summary, billingMode: "capped", capUsdPicos: 20n * USD, remainingUsdPicos: 5n * USD - 1n });
  assert.equal(capped.cap, "20.000000000000"); assert.equal(capped.remaining, "4.999999999999");
  assert.equal(Object.hasOwn(capped, "billingMode"), false, "legacy capped telemetry retains its existing shape");
});
