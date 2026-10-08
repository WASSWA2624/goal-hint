import "server-only";

import type { CostAttempt, CostQuantities, CostTotals, CostUsage } from "./cost-contract.ts";
import { CostInputError, parseCostAttempt, parseCostQuantities } from "./cost-input.ts";
import { priceCost } from "./cost-pricing.ts";

const fields = ["requests", "inputTokens", "outputTokens", "billedUnits"] as const;
/** Separate receipts can establish larger values for different billed components. */
export function costObservedQuantities(reconciliations: readonly Readonly<{ usage: CostUsage }>[]): CostQuantities | null {
  let result: { -readonly [Key in keyof CostQuantities]: number } | null = null;
  for (const { usage } of reconciliations) {
    if (usage.observedQuantities === null) continue;
    const quantities = parseCostQuantities(usage.observedQuantities);
    if (result === null) result = { ...quantities };
    else for (const field of fields) result[field] = Math.max(result[field], quantities[field]);
  }
  return result === null ? null : Object.freeze(result);
}
/** The same conservative projections drive SQL aggregates and isolated unit stores. */
export function costAttemptTotals(input: CostAttempt): CostTotals {
  const attempt = parseCostAttempt(input);
  if (priceCost(attempt.rate, attempt.request.maximum) !== attempt.maximumCostUsdPicos) throw new CostInputError();
  const empty = { liabilityUsdPicos: 0n, estimatedUsdPicos: 0n, observedUsdPicos: 0n, invoicedUsdPicos: 0n,
    requests: 0n, inputTokens: 0n, outputTokens: 0n, billedUnits: 0n, elapsedMs: 0n, attemptCount: 1n, hasOverage: false };
  if (attempt.state === "queued" || attempt.state === "canceled") return Object.freeze(empty);
  const complete = attempt.state === "completed" && attempt.usage?.kind === "complete";
  const quantities: { -readonly [Key in keyof CostQuantities]: number } = {
    ...(complete && attempt.usage!.observedQuantities !== null ? attempt.usage!.observedQuantities : attempt.request.maximum),
  };
  let elapsed = complete && attempt.usage!.observedQuantities !== null ? 0 : attempt.request.timeoutMs;
  for (const item of attempt.reconciliations) {
    elapsed = Math.max(elapsed, item.usage.elapsedMs);
    if (item.usage.observedQuantities !== null) for (const field of fields) {
      quantities[field] = Math.max(quantities[field], item.usage.observedQuantities[field]);
    }
  }
  quantities.requests = Math.max(1, quantities.requests);
  let unpricedObservedUsage = false;
  let knownEstimate = 0n;
  const observedQuantities = costObservedQuantities(attempt.reconciliations);
  if (observedQuantities !== null) {
    try { knownEstimate = priceCost(attempt.rate, observedQuantities); }
    catch (error) {
      if (!(error instanceof CostInputError) || !["unpriced", "invalid-pricing"].includes(error.reason)) throw error;
      // Keep the actual observation and the full reservation. A new unpriced
      // billing dimension is an overage that blocks later paid dispatch.
      unpricedObservedUsage = true;
    }
  }
  if (!complete && attempt.liabilityUsdPicos < knownEstimate) throw new CostInputError();
  if (complete) {
    const monetaryReceipt = attempt.observedUsdPicos !== null || attempt.invoicedUsdPicos !== null;
    if (!monetaryReceipt && attempt.liabilityUsdPicos < knownEstimate) throw new CostInputError();
    if (!monetaryReceipt && unpricedObservedUsage && attempt.liabilityUsdPicos < attempt.maximumCostUsdPicos) throw new CostInputError();
    if (attempt.rate.billingRule === "invoice-required" && attempt.invoicedUsdPicos === null &&
      attempt.liabilityUsdPicos < attempt.maximumCostUsdPicos) throw new CostInputError();
  }
  return Object.freeze({ liabilityUsdPicos: attempt.liabilityUsdPicos, estimatedUsdPicos: attempt.estimatedUsdPicos ?? 0n,
    observedUsdPicos: attempt.observedUsdPicos ?? 0n, invoicedUsdPicos: attempt.invoicedUsdPicos ?? 0n,
    requests: BigInt(quantities.requests), inputTokens: BigInt(quantities.inputTokens), outputTokens: BigInt(quantities.outputTokens),
    billedUnits: BigInt(quantities.billedUnits), elapsedMs: BigInt(elapsed), attemptCount: 1n,
    hasOverage: unpricedObservedUsage || attempt.liabilityUsdPicos > attempt.maximumCostUsdPicos || elapsed > attempt.request.timeoutMs ||
      fields.some((field) => quantities[field] > attempt.request.maximum[field]),
  });
}
