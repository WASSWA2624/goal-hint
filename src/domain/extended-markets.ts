import { z } from "zod";

export const extendedMarketSources = ["ai-score-distribution", "market-implied"] as const;
export type ExtendedMarketSource = typeof extendedMarketSources[number];
export const extendedSettlementStatuses = ["correct", "incorrect", "half-win", "half-loss", "push", "pending", "void", "unavailable"] as const;
export type ExtendedSettlementStatus = typeof extendedSettlementStatuses[number];
const label = z.string().min(1).max(128).refine((value) => value === value.trim() && !/[\p{Cc}<>]/u.test(value));
const probability = z.number().finite().min(0).max(1);
const outcomes = z.strictObject({ win: probability, "half-win": probability, push: probability, "half-loss": probability, loss: probability });

/** Additive public contract. Model events and normalized bookmaker prices retain distinct meanings. */
const publicFields = {
  key: z.string().regex(/^(?:goal|implied):[a-z0-9:._-]{1,122}$/u), label, code: label.max(16),
  period: z.enum(["full-time", "half-time", "second-half"]), ruleVersion: label,
  source: z.enum(extendedMarketSources), sourceLabel: z.enum(["AI score distribution", "Market-implied"]),
  probabilityBasis: z.enum(["model-event", "model-positive-payout", "normalized-bookmaker-price", "conditional-payout-price"]),
  selection: label.max(64), selectionLabel: label, selectedProbability: probability,
  result: z.strictObject({ status: z.enum(extendedSettlementStatuses), reason: label,
    correctedAt: z.number().int().nonnegative().nullable() }),
};
function sourceCoherent(market: z.infer<z.ZodObject<typeof publicFields>>): boolean {
  const ai = market.source === "ai-score-distribution";
  return market.key.split(":")[1] === market.period && ai === market.key.startsWith("goal:") &&
    market.sourceLabel === (ai ? "AI score distribution" : "Market-implied") && ai === market.probabilityBasis.startsWith("model-");
}
/** Lightweight selected values used on a feed card; detailed alternatives remain on demand. */
export const publicExtendedPickSchema = z.strictObject(publicFields).refine(sourceCoherent);
export type PublicExtendedPick = Readonly<z.infer<typeof publicExtendedPickSchema>>;
export const publicExtendedMarketSchema = z.strictObject({ ...publicFields,
  selections: z.array(z.strictObject({ key: label.max(64), label, probability,
    settlementProbabilities: outcomes.optional() })).min(2).max(1000),
}).superRefine((market, context) => {
  const selected = market.selections.find(({ key }) => key === market.selection);
  const ai = market.source === "ai-score-distribution";
  if (!sourceCoherent(market) || new Set(market.selections.map(({ key }) => key)).size !== market.selections.length ||
      selected?.label !== market.selectionLabel || selected.probability !== market.selectedProbability ||
      market.selections.some(({ settlementProbabilities }) => ai !== (settlementProbabilities !== undefined))) {
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
