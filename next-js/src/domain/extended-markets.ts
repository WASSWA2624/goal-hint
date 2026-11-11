import { z } from "zod";
import { parseDecimalOdds } from "./odds.ts";

export const total15MarketKey = "goal:full-time:totals:total:1.5:binary" as const;
export const total15Selections = ["over", "under"] as const;

export const extendedMarketSources = ["ai-score-distribution", "local-poisson", "market-implied"] as const;
export type ExtendedMarketSource = typeof extendedMarketSources[number];
export const extendedMarketSourceLabels = {
  "ai-score-distribution": "AI score distribution", "local-poisson": "Local Engine", "market-implied": "Market-implied",
} as const;
export const extendedSettlementStatuses = ["correct", "incorrect", "half-win", "half-loss", "push", "pending", "void", "unavailable"] as const;
export type ExtendedSettlementStatus = typeof extendedSettlementStatuses[number];
export const settledExtendedStatuses = ["correct", "incorrect", "half-win", "half-loss", "push"] as const;
const text = z.string().min(1).refine((value) => value === value.trim() && !/[\p{Cc}<>]/u.test(value));
const label = text.max(128), selectionLabel = text.max(512);
const probability = z.number().finite().min(0).max(1);
const outcomes = z.strictObject({ win: probability, "half-win": probability, push: probability, "half-loss": probability, loss: probability });

/** Additive public contract. Model events and normalized bookmaker prices retain distinct meanings. */
const publicFields = {
  key: z.string().regex(/^(?:goal|implied):[a-z0-9:._-]{1,122}$/u), label, code: label.max(16),
  period: z.enum(["full-time", "half-time", "second-half"]), ruleVersion: label,
  source: z.enum(extendedMarketSources), sourceLabel: z.enum(extendedMarketSourceLabels),
  probabilityBasis: z.enum(["model-event", "model-positive-payout", "normalized-bookmaker-price", "conditional-payout-price"]),
  selection: label.max(64), selectionLabel, selectedProbability: probability,
  result: z.strictObject({ status: z.enum(extendedSettlementStatuses), reason: label,
    correctedAt: z.number().int().nonnegative().nullable() }),
};
function sourceCoherent(market: z.infer<z.ZodObject<typeof publicFields>>): boolean {
  const model = market.source !== "market-implied";
  if (market.source === "local-poisson" && (market.key !== total15MarketKey || market.probabilityBasis !== "model-event" ||
      !total15Selections.some((selection) => selection === market.selection))) return false;
  return market.key.split(":")[1] === market.period && model === market.key.startsWith("goal:") &&
    market.sourceLabel === extendedMarketSourceLabels[market.source] && model === market.probabilityBasis.startsWith("model-");
}
/** Lightweight selected values used on a feed card; detailed alternatives remain on demand. */
export const publicExtendedPickSchema = z.strictObject(publicFields).refine(sourceCoherent);
export type PublicExtendedPick = Readonly<z.infer<typeof publicExtendedPickSchema>>;
export const publicExtendedMarketSchema = z.strictObject({ ...publicFields,
  selections: z.array(z.strictObject({ key: label.max(64), label: selectionLabel, probability,
    settlementProbabilities: outcomes.optional() })).min(2).max(1000),
}).superRefine((market, context) => {
  const selected = market.selections.find(({ key }) => key === market.selection);
  const model = market.source !== "market-implied";
  if (!sourceCoherent(market) || new Set(market.selections.map(({ key }) => key)).size !== market.selections.length ||
      selected?.label !== market.selectionLabel || selected.probability !== market.selectedProbability ||
      market.selections.some(({ settlementProbabilities }) => model !== (settlementProbabilities !== undefined))) {
    context.addIssue({ code: "custom", message: "Market identity, selected value and source semantics must describe the same published pick." });
  }
});
export type PublicExtendedMarket = Readonly<Omit<z.infer<typeof publicExtendedMarketSchema>, "selections"> & {
  selections: readonly z.infer<typeof publicExtendedMarketSchema>["selections"][number][];
}>;

export type PublicExtendedMarketSnapshot = Readonly<{
  version: 1; fixtureId: string; cycleId: string; revisionId: string; publishedAt: number;
  mode: "current" | "locked" | "void"; markets: readonly PublicExtendedMarket[];
}>;
export const publicExtendedMarketSnapshotSchema = z.strictObject({
  version: z.literal(1), fixtureId: z.uuid(), cycleId: z.uuid(), revisionId: z.uuid(), publishedAt: z.number().int().nonnegative(),
  mode: z.enum(["current", "locked", "void"]), markets: z.array(publicExtendedMarketSchema).max(512),
}).refine(({ markets }) => new Set(markets.map(({ key }) => key)).size === markets.length);

const exactDecimal = z.string().refine((price) => parseDecimalOdds(price)?.text === price);
export const total15PricesSchema = z.tuple([
  z.strictObject({ selection: z.literal(total15Selections[0]), price: exactDecimal }),
  z.strictObject({ selection: z.literal(total15Selections[1]), price: exactDecimal }),
]);
export const total15OddsSchema = z.strictObject({
  marketKey: z.literal(total15MarketKey), kind: z.enum(["pre-match", "in-play"]),
  checkedAt: z.number().int().nonnegative(), selections: total15PricesSchema,
});
export type Total15Odds = z.infer<typeof total15OddsSchema>;
