import { bookmakerGoalPrice, bookmakerMarketPrice, type PreMatchBookmakerOdds } from "./bookmaker-odds.ts";
import { fullDetailSnapshot } from "./detail-snapshot.ts";
import type { ExtendedSettlementStatus, FeaturedPrediction, RetrospectivePrediction } from "./extended-markets.ts";
import { feedMarketPickIdentity } from "./feed-market-picks.ts";
import { displayMarketOddsPrice } from "./in-play-odds.ts";
import { legacyFamilyByGoalKey } from "./legacy-goal-market-identities.ts";
import { hasMatchPredictionAccess } from "./match-detail-tabs.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import { currentFeaturedOutcome, featuredFamily, marketRow, selectedDetailPrice, type LiveStanding } from "./match-details.ts";
import { selectionOccurred } from "./market-settlement.ts";
import { isMarketFamily, isMarketSelection, type MarketFamily } from "./markets.ts";
import { compareForecastPicks, forecastSourceConfidence, type ComparableForecastPick } from "./recommendation.ts";
import { recommendationMarket } from "./recommendation-view.ts";
import { goalSelectionGradeAtScore } from "./score-distribution-markets.ts";

export type PredictionPriceKind = "pre-match" | "in-play" | "closing" | "historical-pre-match";
type PredictionPrice = Readonly<{ odds: string | null; priceKind?: PredictionPriceKind }>;

export type MatchSummaryPick = ComparableForecastPick & PredictionPrice & Readonly<{
  family: MarketFamily;
  label?: string;
  selectionLabel?: string;
  status: ExtendedSettlementStatus;
  forecast?: FeaturedPrediction;
  historicalOdds?: RetrospectivePrediction["historicalOdds"];
}>;

function price(odds: string | null | undefined, priceKind?: PredictionPriceKind): PredictionPrice {
  return odds ? { odds: displayMarketOddsPrice(odds), ...(priceKind ? { priceKind } : {}) } : { odds: null };
}

function publishedBookmakerPrice(data: MatchDetailResponse, lookup: (odds: PreMatchBookmakerOdds) => string | null): PredictionPrice {
  for (const odds of [data.bookmakerOdds, data.recoveredBookmakerOdds]) {
    if (!odds) continue;
    const matched = lookup(odds);
    if (matched) return price(matched, odds.kind);
  }
  return { odds: null };
}

function corePrice(data: MatchDetailResponse, family: MarketFamily): PredictionPrice {
  const kind = data.fixture.status === "live" ? "in-play" : data.fixture.status === "scheduled" ? "pre-match" : undefined;
  const selected = selectedDetailPrice(data, family);
  const mode = data.snapshot?.applicability;
  if (selected || kind !== "in-play" || data.selection !== "applicable" || (mode !== "current" && mode !== "locked")) return price(selected, kind);
  const item = marketRow(data, family).item;
  return item ? publishedBookmakerPrice(data, odds => bookmakerMarketPrice(odds, family, item.market.selection)) : { odds: null };
}

function publishedExtendedPrice(data: MatchDetailResponse, key: string, selection: string): PredictionPrice {
  const observed = data.extendedOdds;
  const observedPrice = observed?.marketKey === key && observed.selections.find((offer) => offer.selection === selection)?.price;
  if (observed && observedPrice) return price(observedPrice, observed.kind);
  return publishedBookmakerPrice(data, odds => bookmakerGoalPrice(odds, key, selection));
}

function summaryStatus(data: MatchDetailResponse, status?: ExtendedSettlementStatus): ExtendedSettlementStatus {
  if (data.snapshot?.applicability === "historical") return "unavailable";
  return status ?? (data.snapshot?.applicability === "void" ? "void" : "pending");
}

/** Match the exact stored selection, including forecasts whose recommendation differs from the family's argmax. */
export function matchSummaryStanding(data: MatchDetailResponse, pick: MatchSummaryPick): LiveStanding | null {
  const { fixture, snapshot } = data;
  if (fixture.status !== "live" || !fixture.score || data.selection !== "applicable" ||
    (snapshot?.applicability !== "current" && snapshot?.applicability !== "locked") || pick.status !== "pending") return null;
  const phase = fixture.liveClock?.phase;
  if ((phase === "extra-time" || phase === "penalties") && fixture.scorePeriod !== "regulation") return null;
  if (isMarketSelection(pick.key, pick.selection)) {
    return selectionOccurred(pick.selection, fixture.score.home, fixture.score.away) ? "on-track" : "off-track";
  }
  const identity = feedMarketPickIdentity(`${pick.key}~${pick.selection}`);
  if (!identity) return null;
  const halfTimeScore = phase === "half-time" && identity.definition.period !== "second-half" ||
    phase === "first-half" && identity.definition.period === "half-time" ? fixture.score : null;
  const grade = goalSelectionGradeAtScore(identity.definition, identity.selection, fixture.score, halfTimeScore);
  if (grade === "win" || grade === "half-win") return "on-track";
  if (grade === "loss" || grade === "half-loss") return "off-track";
  return null;
}

const marketKey = (key: string) => legacyFamilyByGoalKey.get(key) ?? key;

function publishedSummaryPicks(data: MatchDetailResponse): MatchSummaryPick[] {
  const snapshot = fullDetailSnapshot(data);
  if (!snapshot) return [];
  const core = snapshot.markets.map(({ market }) => ({
    key: market.family, family: market.family, selection: market.selection, probability: market.selectedProbability,
    confidence: forecastSourceConfidence(market.source) ?? "limited", ...corePrice(data, market.family),
    status: summaryStatus(data, marketRow(data, market.family).outcome?.status),
  }));
  const publishedCore = new Set<string>(core.map(({ family }) => family));
  const extended = data.extendedMarkets?.markets.flatMap((market): MatchSummaryPick[] => {
    if (market.source === "market-implied" || publishedCore.has(marketKey(market.key))) return [];
    return [{ key: market.key, family: legacyFamilyByGoalKey.get(market.key) ?? "total-goals", label: market.label,
      selection: market.selection, selectionLabel: market.selectionLabel, probability: market.selectedProbability,
      confidence: forecastSourceConfidence(market.source === "local-poisson" ? "local-engine" : "ai") ?? "limited",
      ...publishedExtendedPrice(data, market.key, market.selection), status: summaryStatus(data, market.result.status) }];
  }) ?? [];
  return [...core, ...extended];
}

function featuredSummaryPick(data: MatchDetailResponse): MatchSummaryPick | null {
  const snapshot = fullDetailSnapshot(data);
  const featured = currentFeaturedOutcome(data);
  const family = featured?.family ?? featuredFamily(data);
  if (!family) return null;
  const { item, outcome } = marketRow(data, family);
  if (featured) {
    const matchingExtended = data.extendedMarkets?.markets.find(({ key, selection }) => key === featured.key && selection === featured.selection);
    const matchingCore = featured.key === family && item?.market.selection === featured.selection;
    const displayedPrice = featured.odds || featured.tier === "forecast-only" ? price(featured.odds, "pre-match")
      : matchingCore ? corePrice(data, family) : matchingExtended ? publishedExtendedPrice(data, featured.key, featured.selection) : { odds: null };
    return { key: featured.key, family, ...(!isMarketFamily(featured.key) ? { label: featured.label, selectionLabel: featured.selectionLabel } : {}),
      selection: featured.selection, probability: featured.probability, forecast: featured, ...displayedPrice,
      status: summaryStatus(data, featured.settlementStatus ?? (matchingCore ? outcome?.status : matchingExtended?.result.status)) };
  }
  if (!item) return null;
  const selected = recommendationMarket(item.market, snapshot?.recommendation);
  const matchesPublication = selected.selection === item.market.selection;
  return { key: family, family, selection: selected.selection, probability: selected.selectedProbability,
    ...(matchesPublication ? corePrice(data, family) : { odds: null }), status: summaryStatus(data, matchesPublication ? outcome?.status : undefined) };
}

function replaySummaryPick(pick: RetrospectivePrediction): MatchSummaryPick {
  return { key: pick.key, family: pick.family, label: pick.label, selection: pick.selection, selectionLabel: pick.selectionLabel,
    probability: pick.probability, confidence: forecastSourceConfidence(pick.source) ?? "limited", forecast: pick,
    historicalOdds: pick.historicalOdds, ...(pick.historicalOdds ? price(pick.odds, "historical-pre-match") : { odds: null }),
    status: pick.settlementStatus ?? "pending" };
}

/** Keep the official featured pick and rank other published selections within the same forecast or replay. */
export function matchPredictionSummary(data: MatchDetailResponse) {
  if (!hasMatchPredictionAccess(data) || "gated" in data.history) return null;
  const replay = data.selection === "applicable" ? data.fixture.retrospective : null;
  const replayMarkets = data.selection === "applicable" ? data.retrospectiveMarkets : null;
  const featured = replay ? replaySummaryPick(replay.pick) : featuredSummaryPick(data);
  const available = replayMarkets ? replayMarkets.map(replaySummaryPick) : replay ? [] : publishedSummaryPicks(data);
  const featuredMarket = featured && marketKey(featured.key);
  const other = available.filter(({ key, probability }) => marketKey(key) !== featuredMarket && probability > 0)
    .sort(compareForecastPicks).slice(0, 4);
  return { featured, other, replay };
}
