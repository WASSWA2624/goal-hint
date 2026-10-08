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
