import { z } from "zod";
import { deMargin, DE_MARGIN_METHOD, oddsDisplayHundredths, parseDecimalOdds } from "./odds.ts";
import type { OddsBetObservation } from "./odds-markets.ts";
import { NON_GOAL_MARKET_RULE_VERSION, nonGoalMarketDefinitionSchema, type NonGoalMarketDefinition } from "./non-goal-market-definitions.ts";

export const IMPLIED_MARKET_MAPPING_VERSION = "reviewed-non-goal-bets-v1";
export const impliedBetMappingSchema = z.strictObject({
  betId: z.number().int().min(1).max(4_294_967_295), betName: z.string().min(1).max(256),
  definition: nonGoalMarketDefinitionSchema, providerLabels: z.record(z.string(), z.string().min(1).max(64)),
}).superRefine((mapping, context) => {
  const keys = mapping.definition.selections.map(({ key }) => key), labels = Object.values(mapping.providerLabels);
  if (keys.length !== labels.length || keys.some((key) => !Object.hasOwn(mapping.providerLabels, key)) || new Set(labels).size !== labels.length) {
    context.addIssue({ code: "custom", message: "Every settlement selection needs one exact unique provider label." });
  }
});
export type ImpliedBetMapping = Readonly<z.infer<typeof impliedBetMappingSchema>>;
export type ImpliedMarketSelection = Readonly<{ key: string; label: string; price: string; displayHundredths: number; normalizedProbability: string }>;
export type MarketImpliedMarket = Readonly<{
  source: "market-implied"; ruleVersion: typeof NON_GOAL_MARKET_RULE_VERSION; mappingVersion: typeof IMPLIED_MARKET_MAPPING_VERSION;
  method: typeof DE_MARGIN_METHOD; probabilityBasis: "normalized-bookmaker-price" | "conditional-payout-price";
  definition: NonGoalMarketDefinition; coverage: 1 | 2; overround: string;
  selections: readonly ImpliedMarketSelection[]; selection: string; selectedProbability: number; selectedNormalizedProbability: string;
}>;
export type ImpliedDerivationResult = Readonly<{ available: true; market: MarketImpliedMarket }> |
  Readonly<{ available: false; reason: "invalid-mapping" | "unverified-provider-bet" | "incomplete-provider-group" | "invalid-price-group" }>;

/** Exact catalog identity and complete selections from one stored bookmaker/bet/line. Never an AI estimate. */
export function deriveMappedImpliedMarket(mappingInput: unknown, catalog: ReadonlyMap<number, string> | null,
  observation: OddsBetObservation | undefined): ImpliedDerivationResult {
  const parsed = impliedBetMappingSchema.safeParse(mappingInput);
  if (!parsed.success) return { available: false, reason: "invalid-mapping" };
  const mapping = parsed.data;
  if (!observation || observation.betId !== mapping.betId || observation.betName !== mapping.betName || catalog?.get(mapping.betId) !== mapping.betName) {
    return { available: false, reason: "unverified-provider-bet" };
  }
  const quoted = mapping.definition.selections.map(({ key }) => observation.values.filter(({ label }) => label === mapping.providerLabels[key]));
  if (quoted.some((rows) => rows.length !== 1)) return { available: false, reason: "incomplete-provider-group" };
  const prices = quoted.map((rows) => parseDecimalOdds(rows[0]!.odd)), coverage = mapping.definition.kind === "double-chance" ? 2 : 1;
  const implied = deMargin(prices, coverage);
  if (!implied || !/^\d\./u.test(implied.overround)) return { available: false, reason: "invalid-price-group" };
  const selections = mapping.definition.selections.map(({ key, label }, index) => Object.freeze({ key, label, price: prices[index]!.text,
    displayHundredths: oddsDisplayHundredths(prices[index]!), normalizedProbability: implied.probabilities[index]! }));
  let selected = selections[0]!;
  for (const entry of selections) if (entry.normalizedProbability > selected.normalizedProbability) selected = entry;
  const payout = mapping.definition.kind === "asian-total" || mapping.definition.kind === "asian-handicap";
  return { available: true, market: Object.freeze({ source: "market-implied", ruleVersion: NON_GOAL_MARKET_RULE_VERSION,
    mappingVersion: IMPLIED_MARKET_MAPPING_VERSION, method: DE_MARGIN_METHOD,
    probabilityBasis: payout ? "conditional-payout-price" : "normalized-bookmaker-price", definition: mapping.definition,
    coverage, overround: implied.overround, selections: Object.freeze(selections), selection: selected.key,
    selectedProbability: Number(selected.normalizedProbability), selectedNormalizedProbability: selected.normalizedProbability }) };
}

/** No fuzzy catalog-name guessing: every observed provider bet remains inventoried even without a reviewed rule. */
export function impliedCatalogCoverage(catalog: readonly Readonly<{ id: number; name: string }>[], mappings: readonly ImpliedBetMapping[]) {
  return catalog.map((entry) => Object.freeze({ ...entry, source: "market-implied" as const,
    marketKeys: mappings.filter((mapping) => mapping.betId === entry.id && mapping.betName === entry.name).map(({ definition }) => definition.key),
    reason: mappings.some((mapping) => mapping.betId === entry.id && mapping.betName === entry.name) ? null : "unreviewed-settlement-rule" as const }));
}
