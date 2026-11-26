import "server-only";

import { getPublicationDeadline } from "../../domain/calendar.ts";
import type { FeaturedPrediction } from "../../domain/extended-markets.ts";
import type { StoredFixtureSnapshot } from "../../domain/fixture-snapshot.ts";
import { binaryFeaturedSettlement, decideLocalFeaturedPick, localFeaturedQuoteScopeReason } from "../../domain/local-featured-decision.ts";
import { rankFixtureOutcomes } from "../../domain/market-ranking.ts";
import type { AcceptedMarket } from "../../domain/markets.ts";
import { predictionText } from "../../domain/prediction-label.ts";
import { preMatchReferenceOddsFreshMs } from "../../domain/reference-odds.ts";
import { createMessages } from "../../i18n/messages.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import type { StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import type { FeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { toFeaturedLocalDecision } from "./featured-pick-presentation.ts";

const messages = createMessages("en");
const fullTimeTotal25 = "goal:full-time:totals:total:2.5:binary";
type Candidate = Parameters<typeof decideLocalFeaturedPick>[0]["outcomes"][number];

/** Reuse the accepted Local Engine distributions for display and read-only decision comparisons. */
export function collectUpcomingLocalFeaturedCandidates(forecast: Readonly<{ markets: readonly Readonly<{ market: AcceptedMarket }>[] }> | null,
  goals: FeaturedGoalMarkets | undefined) {
  const launch = forecast?.markets.filter(({ market }) => market.source === "local-engine") ?? [];
  if (!launch.length && !goals?.local.length) return null;
  const candidates: { outcome: Candidate; pick: Omit<FeaturedPrediction, "odds" | "probability"> }[] = [];
  for (const { market } of launch) for (const [selection, probability] of Object.entries(market.probabilities)) {
    const { family, source } = market;
    candidates.push({ outcome: { marketKey: family, selection, settlementProbabilities: binaryFeaturedSettlement(probability) },
      pick: { key: family, family, label: messages.text(`market.family.${family}`), code: null, selection,
        selectionLabel: predictionText(messages, selection), source } });
  }
  const hasLegacyTotal25 = launch.some(({ market }) => market.family === "total-goals");
  for (const market of goals?.local ?? []) for (const { key, label, settlementProbabilities } of market.selections) {
    if (!settlementProbabilities || market.key === fullTimeTotal25 && hasLegacyTotal25) continue;
    candidates.push({ outcome: { marketKey: market.key, selection: key, settlementProbabilities,
      ...(market.unrepresentedProbability === undefined ? {} : { unrepresentedProbability: market.unrepresentedProbability }) },
      pick: { key: market.key, family: "total-goals", label: market.label, code: market.code, selection: key,
        selectionLabel: label, source: "local-engine" } });
  }
  return candidates;
}

/** Use the same private, occurrence-scoped inputs for Matches and Match Details. */
export function upcomingFeaturedPick(fixture: Pick<StoredFixtureSnapshot, "fixtureId" | "kickoffAt" | "status" | "forecast" | "marketOdds">,
  goals: FeaturedGoalMarkets | null | undefined, quotes: StoredCurrentBookmakerQuotes | null | undefined,
  decisionAt: number, quotesPermitted: boolean): FeaturedPrediction | null {
  const { fixtureId, kickoffAt, forecast, marketOdds } = fixture;
  if (!forecast || fixture.status !== "scheduled" || kickoffAt === null || goals === null) return null;
  const deadline = getPublicationDeadline(kickoffAt);
  if (decisionAt >= deadline || forecast.publishedAt > decisionAt || forecast.publishedAt >= deadline) return null;
  const currentQuotes = quotes && decisionAt - quotes.checkedAt <= preMatchReferenceOddsFreshMs && quotes.provenance !== "historical-pre-match"
    && !localFeaturedQuoteScopeReason({ fixtureId, kickoffAt, decisionAt, quotes, quotesPermitted }) ? quotes : null;
  const candidates = collectUpcomingLocalFeaturedCandidates(forecast, goals);
  if (!candidates) {
    const timelyMarketOdds = quotesPermitted && marketOdds?.kind === "pre-match" && marketOdds.checkedAt <= decisionAt
      && decisionAt - marketOdds.checkedAt <= preMatchReferenceOddsFreshMs ? marketOdds : null;
    return rankFixtureOutcomes(forecast.markets, goals?.published ?? [], projectBookmakerOdds(currentQuotes, "pre-match"),
      timelyMarketOdds, forecast.recommendation);
  }
  const decision = decideLocalFeaturedPick({ fixtureId, kickoffAt, decisionAt, outcomes: candidates.map(({ outcome }) => outcome),
    quotes: currentQuotes, quotesPermitted });
  if (decision.status !== "priced") return null;
  const candidate = candidates.find(({ outcome }) => outcome.marketKey === decision.marketKey && outcome.selection === decision.selection);
  return candidate ? toFeaturedLocalDecision(decision, "en", quotesPermitted, candidate.pick) : null;
}
