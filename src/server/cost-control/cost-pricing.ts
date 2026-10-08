import "server-only";

import type { CostAmount, CostQuantities, CostRateCard } from "./cost-contract.ts";
import { COST_MAX_USD_PICOS, CostInputError, costUsdDecimal, costUsdPicosFromDecimal, parseCostQuantities, parseCostRate } from "./cost-input.ts";

/** An accounting estimate under a verified card; this is never an invoice. */
export type CostPriceEstimate = Readonly<{
  kind: "estimated"; usdPicos: CostAmount; usd: string;
  components: Readonly<Record<keyof CostQuantities, CostAmount>>;
}>;
export function estimateCost(inputRate: CostRateCard, inputQuantities: CostQuantities): CostPriceEstimate {
  const rate = parseCostRate(inputRate), quantities = parseCostQuantities(inputQuantities);
  const numerator = BigInt(rate.usdConversion.numerator), denominator = BigInt(rate.usdConversion.denominator);
  const components = { requests: 0n, inputTokens: 0n, outputTokens: 0n, billedUnits: 0n };
  for (const field of ["requests", "inputTokens", "outputTokens", "billedUnits"] as const) {
    if (quantities[field] === 0) continue;
    const unit = rate.rates[field];
    if (unit === null) throw new CostInputError("unpriced");
    const raw = costUsdPicosFromDecimal(unit.amount) * BigInt(quantities[field]) * numerator;
    const divisor = BigInt(unit.perUnits) * denominator;
    components[field] = (raw + divisor - 1n) / divisor;
    if (components[field] > COST_MAX_USD_PICOS) throw new CostInputError("invalid-pricing");
  }
  const usdPicos = Object.values(components).reduce((sum, value) => sum + value, 0n);
  if (usdPicos > COST_MAX_USD_PICOS) throw new CostInputError("invalid-pricing");
  return Object.freeze({ kind: "estimated", usdPicos, usd: costUsdDecimal(usdPicos), components: Object.freeze(components) });
}
export function priceCost(rate: CostRateCard, quantities: CostQuantities): CostAmount {
  return estimateCost(rate, quantities).usdPicos;
}
