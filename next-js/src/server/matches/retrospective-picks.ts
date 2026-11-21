import "server-only";

import { createMessages } from "../../i18n/messages.ts";
import { isVerifiedPreMatchObservation, replayBookmakerBetIds, replayBookmakerQuote } from "../../domain/bookmaker-odds.ts";
import type { RetrospectivePrediction } from "../../domain/extended-markets.ts";
import { feedMarketPickIdentity } from "../../domain/feed-market-picks.ts";
import type { StoredFixtureSnapshot } from "../../domain/fixture-snapshot.ts";
import { formatOddsHundredths } from "../../domain/odds.ts";
import { predictionText } from "../../domain/prediction-label.ts";
import type { NovemberReplayProjection } from "../intelligence/november-replay-store.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import { storedVerifiedReplayBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import type { FeedSelectedPick } from "./feed-selected-picks.ts";

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
  locale: string, shown?: Pick<FeedSelectedPick, "marketKey" | "selection">) {
  if (!replay || fixture.fixtureId !== replay.fixtureId || fixture.cycleId !== replay.cycleId ||
      fixture.kickoffAt !== replay.kickoffAt || fixture.forecast?.revisionId !== replay.sourceRevisionId) return null;
  const entries = replay.markets.flatMap(({ definition, selected }) => {
    const pick = displayFeedSelectedPick({ marketKey: definition.key, ...selected, source: "local-engine", priceHundredths: null }, locale);
    return pick ? [{ marketKey: definition.key, selection: selected.selection, pick: { ...pick, source: "local-engine" as const } }] : [];
  });
  const selected = shown ?? replay.selected;
  const pick = entries.find(({ marketKey, selection }) => selected.marketKey === marketKey && selected.selection === selection)?.pick;
  if (!pick) return null;
  return { card: { revisionId: replay.revisionId, sourceRevisionId: replay.sourceRevisionId,
    evidenceCutoffAt: replay.evidenceCutoffAt, generatedAt: replay.generatedAt, activatedAt: replay.activatedAt, pick },
    markets: entries.map((entry) => entry.pick) };
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
