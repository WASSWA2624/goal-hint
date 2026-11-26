import type { FixturePrice } from "./fixture-snapshot.ts";
import type { AcceptedMarket, MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";
import { bookmakerGoalPrice, bookmakerMarketPrice, type PreMatchBookmakerOdds } from "./bookmaker-odds.ts";
import { marketOddsPrice, type MarketOddsObservation } from "./in-play-odds.ts";
import type { FeaturedGoalMarket, FeaturedPrediction } from "./extended-markets.ts";
import { predictionText } from "./prediction-label.ts";
import { createMessages } from "../i18n/messages.ts";
import { compareForecastPicks, forecastSourceConfidence, type ComparableForecastPick, type ForecastConfidence } from "./recommendation.ts";
import type { PublicRecommendation } from "./recommendation-view.ts";

type PublishedMarket = Readonly<{ market: Pick<AcceptedMarket, "family" | "selection" | "selectedProbability"> & Partial<Pick<AcceptedMarket, "source">>;
  confidence?: ForecastConfidence }>;
type MarketPrice = Pick<FixturePrice, "family" | "selection" | "price" | "recovery">;

export function featuredPrediction<T extends ComparableForecastPick>(outcomes: readonly T[]): T | null {
  return outcomes.reduce<T | null>((best, item) => Number.isFinite(item.probability) && item.probability > 0 && item.probability <= 1 &&
    (best === null || compareForecastPicks(item, best) < 0) ? item : best, null);
}

const messages = createMessages("en");
export function rankFixtureOutcomes(markets: readonly Readonly<{ market: AcceptedMarket; confidence?: ForecastConfidence }>[],
  goalMarkets: readonly (FeaturedGoalMarket & Readonly<{ unrepresentedProbability?: number }>)[],
  prices: PreMatchBookmakerOdds | null, observedOdds?: MarketOddsObservation | null, recommendation?: PublicRecommendation): FeaturedPrediction | null {
  const selected = recommendation?.selected;
  const recommended = selected?.confidence && markets.some(({ market }) => market.family === selected.family && market.source === selected.source &&
    (market.probabilities as Readonly<Record<string, number>>)[selected.selection] === selected.probability) ? selected : null;
  const outcomes: (FeaturedPrediction & { confidence?: ForecastConfidence })[] = [];
  for (const family of publicPolicy.markets) {
    if (recommended && family !== recommended.family) continue;
    const entry = markets.find((item) => item.market.family === family);
    if (!entry) continue;
    const { market: { source } } = entry;
    const confidence = recommended?.confidence ?? entry.confidence ?? forecastSourceConfidence(source);
    const tied = recommended ? [[recommended.selection, recommended.probability] as const]
      : Object.entries(entry.market.probabilities).filter(([, probability]) => probability === entry.market.selectedProbability);
    for (const [selection, probability] of tied) {
      outcomes.push({ key: family, family, label: messages.text(`market.family.${family}`), code: null, selection,
        selectionLabel: predictionText(messages, selection), probability, source,
        odds: bookmakerMarketPrice(prices, family, selection) ??
          (observedOdds?.kind === "pre-match" ? marketOddsPrice(observedOdds, family, selection) : null), ...(confidence ? { confidence } : {}) });
    }
  }
  for (const market of goalMarkets) {
    if (market.source === "market-implied" || market.key === "goal:full-time:totals:total:2.5:binary" || (market.unrepresentedProbability ?? 0) !== 0) continue;
    const source = market.source === "local-poisson" ? "local-engine" : "ai";
    const confidence = forecastSourceConfidence(source);
    const best = featuredPrediction(market.selections.map((selection): FeaturedPrediction & { confidence?: ForecastConfidence } => ({ key: market.key,
      family: "total-goals", label: market.label,
      code: market.code, selection: selection.key, selectionLabel: selection.label,
      probability: selection.settlementProbabilities?.win ?? selection.probability,
      source, odds: bookmakerGoalPrice(prices, market.key, selection.key), ...(confidence ? { confidence } : {}) })));
    if (best) outcomes.push(best);
  }
  const best = featuredPrediction(outcomes);
  if (!best) return null;
  const { confidence: _confidence, ...publicPick } = best;
  void _confidence;
  return publicPick;
}

/** The stored two-place quote must describe this exact published pick. */
function pickPrice(prices: readonly MarketPrice[], market: PublishedMarket["market"]): string | null {
  const value = prices.find((price) => price.family === market.family && price.selection === market.selection && !price.recovery)?.price;
  return value && /^[1-9]\d{0,3}\.\d{2}$/u.test(value) ? value : null;
}

/** Rank stored published picks by unrounded probability, evidence confidence and exact fresh price. */
export function bestPublishedFamily(items: readonly PublishedMarket[] | undefined, prices: readonly MarketPrice[],
  eligible: readonly MarketFamily[] = publicPolicy.markets): MarketFamily | null {
  return featuredPrediction((items ?? []).flatMap(({ market, confidence }) => {
    if (!eligible.includes(market.family)) return [];
    const support = confidence ?? forecastSourceConfidence(market.source);
    return [{ key: market.family, selection: market.selection, probability: market.selectedProbability, odds: pickPrice(prices, market),
      ...(support ? { confidence: support } : {}) }];
  }))?.key ?? null;
}
