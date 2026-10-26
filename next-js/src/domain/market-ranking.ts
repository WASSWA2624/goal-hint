import type { FixturePrice } from "./fixture-snapshot.ts";
import type { AcceptedMarket, MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";

type PublishedMarket = Readonly<{ market: Pick<AcceptedMarket, "family" | "selection" | "selectedProbability"> }>;
type MarketPrice = Pick<FixturePrice, "family" | "selection" | "price">;

/** A fresh public price is usable only for this exact published pick. Compare its stored hundredths, not floats. */
function pickPrice(prices: readonly MarketPrice[], market: PublishedMarket["market"]): number {
  const value = prices.find((price) => price.family === market.family && price.selection === market.selection)?.price;
  return value && /^[1-9]\d{0,3}\.\d{2}$/u.test(value) ? Number(value.replace(".", "")) : 0;
}

/** Highest unrounded forecast probability, then highest exact fresh public price; remaining ties use policy order.
 * Inputs are stored published picks and the fresh-only public price envelope, never implied probabilities or alternatives. */
export function bestPublishedFamily(items: readonly PublishedMarket[] | undefined, prices: readonly MarketPrice[],
  eligible: readonly MarketFamily[] = publicPolicy.markets): MarketFamily | null {
  let best: { family: MarketFamily; probability: number; price: number } | null = null;
  for (const family of publicPolicy.markets) {
    if (!eligible.includes(family)) continue;
    const item = items?.find((entry) => entry.market.family === family);
    if (!item) continue;
    const probability = item.market.selectedProbability, price = pickPrice(prices, item.market);
    if (best === null || probability > best.probability || probability === best.probability && price > best.price) {
      best = { family, probability, price };
    }
  }
  return best?.family ?? null;
}
