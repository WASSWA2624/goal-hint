import type { FixturePrice } from "./fixture-snapshot.ts";
import type { AcceptedMarket, MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";
import { bookmakerGoalPrice, bookmakerMarketPrice, type PreMatchBookmakerOdds } from "./bookmaker-odds.ts";
import { marketOddsPrice, type MarketOddsObservation } from "./in-play-odds.ts";
import type { FeaturedGoalMarket, FeaturedPrediction } from "./extended-markets.ts";
import { predictionText } from "./prediction-label.ts";
import { createMessages } from "../i18n/messages.ts";

type PublishedMarket = Readonly<{ market: Pick<AcceptedMarket, "family" | "selection" | "selectedProbability"> }>;
type MarketPrice = Pick<FixturePrice, "family" | "selection" | "price">;
export type RankedPrediction = Readonly<{ probability: number; odds: string | null }>;

/** Keep input order for exact ties. Odds and probabilities always describe the same outcome. */
export function featuredPrediction<T extends RankedPrediction>(outcomes: readonly T[]): T | null {
  return outcomes.reduce<T | null>((best, item) => {
    if (best === null) return item;
    const price = item.odds === null ? 0 : Number(item.odds), previous = best.odds === null ? 0 : Number(best.odds);
    return (price > 0) !== (previous > 0) ? price > 0 ? item : best
      : item.probability > best.probability || item.probability === best.probability && price > previous ? item : best;
  }, null);
}

const messages = createMessages("en");
export function rankFixtureOutcomes(markets: readonly Readonly<{ market: AcceptedMarket }>[], goalMarkets: readonly FeaturedGoalMarket[],
  prices: PreMatchBookmakerOdds | null, observedOdds?: MarketOddsObservation | null): FeaturedPrediction | null {
  const outcomes: FeaturedPrediction[] = [];
  for (const family of publicPolicy.markets) {
    const market = markets.find((item) => item.market.family === family)?.market;
    if (!market) continue;
    for (const [selection, probability] of Object.entries(market.probabilities)) {
      outcomes.push({ key: family, family, label: messages.text(`market.family.${family}`), code: null, selection,
        selectionLabel: predictionText(messages, selection), probability, source: market.source,
        odds: bookmakerMarketPrice(prices, family, selection) ?? marketOddsPrice(observedOdds, family, selection) });
    }
  }
  for (const market of goalMarkets) {
    if (market.source === "market-implied" || market.key === "goal:full-time:totals:total:2.5:binary") continue;
    for (const selection of market.selections) outcomes.push({ key: market.key, family: "total-goals", label: market.label,
      code: market.code, selection: selection.key, selectionLabel: selection.label, probability: selection.probability,
      source: market.source === "local-poisson" ? "local-engine" : "ai", odds: bookmakerGoalPrice(prices, market.key, selection.key) });
  }
  return featuredPrediction(outcomes);
}

/** A fresh public price is usable only for this exact published pick. Compare its stored hundredths, not floats. */
function pickPrice(prices: readonly MarketPrice[], market: PublishedMarket["market"]): number {
  const value = prices.find((price) => price.family === market.family && price.selection === market.selection)?.price;
  return value && /^[1-9]\d{0,3}\.\d{2}$/u.test(value) ? Number(value.replace(".", "")) : 0;
}

/** Rank priced forecasts ahead of unpriced forecasts, then by unrounded probability and exact fresh price.
 * Inputs are stored published picks and the fresh-only public price envelope, never implied probabilities or alternatives. */
export function bestPublishedFamily(items: readonly PublishedMarket[] | undefined, prices: readonly MarketPrice[],
  eligible: readonly MarketFamily[] = publicPolicy.markets): MarketFamily | null {
  let best: { family: MarketFamily; probability: number; price: number } | null = null;
  for (const family of publicPolicy.markets) {
    if (!eligible.includes(family)) continue;
    const item = items?.find((entry) => entry.market.family === family);
    if (!item) continue;
    const probability = item.market.selectedProbability, price = pickPrice(prices, item.market);
    const priced = price > 0;
    if (best === null || (priced !== (best.price > 0) ? priced
      : probability > best.probability || probability === best.probability && price > best.price)) {
      best = { family, probability, price };
    }
  }
  return best?.family ?? null;
}
