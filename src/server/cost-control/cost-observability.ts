import "server-only";

import { CostInputError, costUsdDecimal, parseCostCategory, parseCostIdentity } from "./cost-input.ts";
import type { CostSummary } from "./cost-service.ts";

function count(value: bigint): string {
  if (typeof value !== "bigint" || value < 0n) throw new CostInputError();
  return value.toString();
}

/** A JSON-safe allowlist for private metrics/logging. Never pass an attempt, receipt or error to a logger. */
export function costSummaryRecord(summary: CostSummary) {
  if (summary.status !== "summary" || typeof summary.overageBlocked !== "boolean") throw new CostInputError();
  return Object.freeze({
    event: "cost-summary" as const,
    accountId: parseCostIdentity(summary.accountId), category: parseCostCategory(summary.category),
    periodId: parseCostIdentity(summary.periodId), currency: "USD" as const,
    cap: costUsdDecimal(summary.capUsdPicos), openingCharged: costUsdDecimal(summary.openingChargedUsdPicos),
    liability: costUsdDecimal(summary.liabilityUsdPicos), remaining: costUsdDecimal(summary.remainingUsdPicos),
    estimated: costUsdDecimal(summary.estimatedUsdPicos), observed: costUsdDecimal(summary.observedUsdPicos),
    invoiced: costUsdDecimal(summary.invoicedUsdPicos),
    requests: count(summary.requests), inputTokens: count(summary.inputTokens), outputTokens: count(summary.outputTokens),
    billedUnits: count(summary.billedUnits), elapsedMs: count(summary.elapsedMs), attempts: count(summary.attemptCount),
    overageBlocked: summary.overageBlocked,
  });
}
