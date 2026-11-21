import "server-only";

import { createMessages } from "../../i18n/messages.ts";
import { isVerifiedPreMatchObservation, replayBookmakerBetIds, replayBookmakerQuote } from "../../domain/bookmaker-odds.ts";
import type { RetrospectivePrediction } from "../../domain/extended-markets.ts";
import { feedMarketPickIdentity } from "../../domain/feed-market-picks.ts";
import type { StoredFixtureSnapshot } from "../../domain/fixture-snapshot.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { formatOddsHundredths } from "../../domain/odds.ts";
import { predictionText } from "../../domain/prediction-label.ts";
import type { NovemberReplayProjection } from "../intelligence/november-replay-store.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import { storedVerifiedReplayBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import type { FeedSelectedPick } from "./feed-selected-picks.ts";

/** Archived Local Engine publications need a replay decision to supply an applicable default pick. */
export function lacksRetrospectiveFeaturedPick(fixture: Pick<StoredFixtureSnapshot, "status" | "forecast" | "retrospective" | "retrospectiveSuppression">): boolean {
  return (fixture.status === "live" || isPlayedFinalStatus(fixture.status)) && !fixture.retrospective && !fixture.retrospectiveSuppression &&
    fixture.forecast?.markets.some(({ market }) => market.source === "local-engine") === true;
}

export function displayFeedSelectedPick({ marketKey, selection, probability, source, priceHundredths }: FeedSelectedPick, locale: string) {
  const identity = feedMarketPickIdentity(`${marketKey}~${selection}`);
  if (!identity) return null;
  const { definition, legacy } = identity, choice = definition.selections.find(({ key }) => key === selection)!;
  const messages = createMessages(locale);
  return {
    key: legacy?.family ?? marketKey, family: legacy?.family ?? "total-goals" as const,
    label: legacy ? messages.text(`market.family.${legacy.family}`) : definition.label,
    code: legacy ? null : definition.code, selection: legacy?.selection ?? selection,
    selectionLabel: predictionText(messages, legacy?.selection ?? selection, { marketKey, rule: choice.rule, label: choice.label }),
    source, probability, odds: priceHundredths === null ? null : formatOddsHundredths(Number(priceHundredths)),
  };
}

/** Public replay picks preserve the decision's own identity, probability and original forecast reference. */
export function projectRetrospectiveForecast(fixture: StoredFixtureSnapshot, replay: NovemberReplayProjection | undefined,
  locale: string, shown?: Pick<FeedSelectedPick, "marketKey" | "selection">, providerOdds = false) {
  if (!replay || fixture.fixtureId !== replay.fixtureId || fixture.cycleId !== replay.cycleId ||
      fixture.kickoffAt !== replay.kickoffAt || (fixture.forecast?.revisionId ?? null) !== replay.sourceRevisionId) return null;
  const wanted = shown ?? replay.selected;
  const decision = replay.featuredDecision;
  const quote = providerOdds && decision?.status === "priced" ? decision.quote : null;
  const entries = replay.markets.flatMap(({ definition, selected, selections }) => {
    const exact = wanted?.marketKey === definition.key && selections?.find(({ key }) => key === wanted.selection);
    const choice = exact ? { selection: exact.key, probability: exact.outcomes.win } : selected;
    const pick = displayFeedSelectedPick({ marketKey: definition.key, ...choice, source: "local-engine", priceHundredths: null }, locale);
    if (!pick) return [];
    const price = quote && decision?.status === "priced" && decision.marketKey === definition.key && decision.selection === choice.selection
      ? { odds: quote.decimal, historicalOdds: { bookmakerId: quote.bookmakerId, bookmakerName: quote.bookmakerName,
        observedAt: quote.observedAt, providerUpdatedAt: quote.providerUpdatedAt } } : {};
    return [{ marketKey: definition.key, selection: choice.selection, pick: { ...pick, ...price, source: "local-engine" as const } }];
  });
  const pick = wanted && entries.find(({ marketKey, selection }) => wanted.marketKey === marketKey && wanted.selection === selection)?.pick;
  if (wanted && !pick) return null;
  const metadata = { revisionId: replay.revisionId, sourceRevisionId: replay.sourceRevisionId,
    evidenceCutoffAt: replay.evidenceCutoffAt, generatedAt: replay.generatedAt, activatedAt: replay.activatedAt,
    ...(decision && { featuredDecisionSealed: true as const }) };
  return { metadata, card: pick ? { ...metadata, pick } : null, featuredDecisionSealed: Boolean(decision),
    markets: entries.map((entry) => entry.pick), activatedAt: replay.activatedAt };
}

export function readReplayBookmakerQuotes(database: DatabaseRuntime,
  fixtures: readonly { fixtureId: string; kickoffAt: number | null }[], asOf: number) {
  return database.transaction((tx) => storedVerifiedReplayBookmakerQuotes(tx, fixtures, asOf, replayBookmakerBetIds),
    { isolationLevel: "RepeatableRead", maxWait: 2_000, timeout: 5_000 }).catch(() => null);
}

/** Attach display-only prices without changing the replay's selection, model or original publication. */
export function replayPickPricing(quotes: StoredCurrentBookmakerQuotes | undefined) {
  const odds = projectBookmakerOdds(quotes, "historical-pre-match");
  return (pick: RetrospectivePrediction): RetrospectivePrediction => {
    if (!odds) return pick;
    const quote = replayBookmakerQuote(odds, pick);
    if (quote?.state !== "available" || quote.offer.price === null || quote.actualBookmakerId === null ||
        !isVerifiedPreMatchObservation(quote.offer, odds.kickoffAt)) return pick;
    const { observedAt, providerUpdatedAt } = quote.offer, bookmakerId = quote.actualBookmakerId;
    return { ...pick, odds: quote.offer.price, historicalOdds: { bookmakerId,
      bookmakerName: odds.books.find((book) => book.bookmakerId === bookmakerId)?.name ?? null, observedAt, providerUpdatedAt } };
  };
}
