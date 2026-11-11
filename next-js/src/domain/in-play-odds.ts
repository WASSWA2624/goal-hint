import { z } from "zod";
import { marketSelections, type MarketFamily } from "./markets.ts";
import { parseDecimalOdds } from "./odds.ts";
import { publicPolicy } from "./public-policy.ts";
import { total15PricesSchema } from "./extended-markets.ts";
import { bookmakerMarketsSchema, oddsVersionSchema } from "./bookmaker-odds.ts";

const at = z.number().int().nonnegative().max(253_402_300_799_999);
const offer = z.strictObject({
  family: z.enum(publicPolicy.markets),
  selections: z.array(z.strictObject({
    selection: z.string().max(24),
    price: z.string().refine((value) => parseDecimalOdds(value)?.text === value),
  })).min(2).max(3),
}).refine(({ family, selections }) => marketSelections[family].length === selections.length
  && marketSelections[family].every((selection, index) => selections[index]?.selection === selection));

export const inPlayOddsBodySchema = z.strictObject({
  state: z.enum(["available", "suspended", "unavailable"]),
  markets: z.array(offer).max(4),
  total15Prices: total15PricesSchema.optional(),
  providerMarkets: bookmakerMarketsSchema.optional(),
}).refine(({ state, markets, total15Prices, providerMarkets }) => (state === "available") === (markets.length > 0 || total15Prices !== undefined || providerMarkets !== undefined)
  && new Set(markets.map(({ family }) => family)).size === markets.length);
export const inPlayOddsObservationSchema = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: at, checkedAt: at, providerUpdatedAt: at.nullable(),
  prices: inPlayOddsBodySchema,
  version: oddsVersionSchema.optional(),
}).refine(({ checkedAt, providerUpdatedAt, version, prices }) => (providerUpdatedAt === null || providerUpdatedAt <= checkedAt) &&
  (version === undefined || prices.providerMarkets !== undefined));
export type InPlayOddsBody = z.infer<typeof inPlayOddsBodySchema>;
export type InPlayOddsObservation = z.infer<typeof inPlayOddsObservationSchema>;

/** Current displayed bookmaker offers are independent of a forecast or sealed publication quote. */
export const marketOddsObservationSchema = z.strictObject({
  kind: z.enum(["pre-match", "in-play"]), checkedAt: at, prices: inPlayOddsBodySchema,
});
export type MarketOddsObservation = z.infer<typeof marketOddsObservationSchema>;

export function displayMarketOddsPrice(price: string) {
  const [whole, fraction = ""] = price.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function marketOddsPrice(observation: Pick<MarketOddsObservation, "prices"> | null | undefined,
  family: MarketFamily, selection: string): string | null {
  const price = observation?.prices.state === "available" ? observation.prices.markets.find((market) => market.family === family)
    ?.selections.find((offer) => offer.selection === selection)?.price : undefined;
  return price === undefined ? null : displayMarketOddsPrice(price);
}

/** Confirmation times change on every poll; only changed offers should rerender a match card. */
export function sameMarketOdds(previous: MarketOddsObservation | null | undefined, next: MarketOddsObservation | null | undefined): boolean {
  if (previous === next || !previous && !next) return true;
  if (!previous || !next || previous.kind !== next.kind || previous.prices.state !== next.prices.state) return false;
  const left = previous.prices.markets, right = next.prices.markets;
  return left.length === right.length && left.every(({ family, selections }, index) => {
    const market = right[index]!;
    return family === market.family && selections.length === market.selections.length && selections.every(({ selection, price }, position) =>
      selection === market.selections[position]!.selection && price === market.selections[position]!.price);
  });
}
