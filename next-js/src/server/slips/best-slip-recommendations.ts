import "server-only";

import { getPublicationDeadline } from "../../domain/calendar.ts";
import { total15MarketKey } from "../../domain/extended-markets.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import { inspectLocalFeaturedQuote, localFeaturedBookmakerBetIds, verifiedLocalFeaturedBinding } from "../../domain/local-featured-decision.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { isSlipMarketSelection, isTotal15SlipSelection, total15Direction, type SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import { editorialSlipOfferSchema, type EditorialSlipOffer } from "../../domain/slip-quote.ts";
import type { SlipSelection } from "../../domain/slip-builder.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { upcomingFeaturedPick } from "../matches/upcoming-featured-pick.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { readFeaturedGoalMarkets, type FeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { storedSlipTotal15Forecasts } from "./slip-goal-forecast.ts";

function exactOffer(quotes: StoredCurrentBookmakerQuotes | undefined, marketKey: string, selection: string,
  bookmakerId: number, at: number): EditorialSlipOffer | null {
  const binding = verifiedLocalFeaturedBinding(marketKey, selection);
  if (!quotes || !binding || bookmakerId !== quotes.primaryBookmakerId) return null;
  const book = quotes.bookmakers.find((value) => value.bookmakerId === bookmakerId);
  const offer = book?.offers.find(({ betId, betName }) => betId === binding.betId && betName === binding.betName);
  const values = offer?.values.filter(({ label }) => label === binding.label);
  if (!book || !offer || values?.length !== 1) return null;
  const inspected = inspectLocalFeaturedQuote(book, offer, values[0]!, at);
  if (!("quote" in inspected)) return null;
  const result = editorialSlipOfferSchema.safeParse(inspected.quote);
  return result.success ? result.data : null;
}

export function reviewedFeaturedSlipSelection(record: StoredMatchFeedRecord, goals: FeaturedGoalMarkets | undefined,
  quotes: StoredCurrentBookmakerQuotes | undefined, total15: SlipTotal15Forecast | undefined, at: number): SlipSelection | null {
  const { forecast, fixtureId, kickoffAt, cycleId } = record;
  if (!forecast || forecast.provisional || forecast.updateDelayed || forecast.publishedAt > at || !cycleId || kickoffAt === null ||
    forecast.publishedAt >= getPublicationDeadline(kickoffAt) || record.status !== "scheduled" || record.cycle?.state !== "open" ||
    record.cycle.mode !== "current" || record.update.prediction !== "current") return null;
  const pick = upcomingFeaturedPick(record, goals, quotes, at, true);
  if (!pick?.featuredQuote || !pick.odds || pick.source !== "local-engine") return null;
  const selection = pick.key === total15MarketKey ? `${pick.selection}-1.5` : pick.selection;
  if (!isSlipMarketSelection(pick.family, selection) || pick.key !== pick.family && pick.key !== total15MarketKey) return null;
  // Only use choices that the original-cycle settlement path can revalidate exactly.
  const market = forecast.markets.find((entry) => entry.market.family === pick.family);
  const supported = isTotal15SlipSelection(selection) ? total15?.source === "local-poisson" && total15.probabilities[selection] === pick.probability
    : market?.market.source === pick.source && (!market.outcome || market.outcome.status === "pending") &&
      (market.market.probabilities as Readonly<Record<string, number>>)[selection] === pick.probability;
  if (!supported) return null;
  const offer = exactOffer(quotes, pick.key, pick.selection, pick.featuredQuote.bookmakerId, at);
  if (!offer || offer.decimal !== pick.odds) return null;
  return { fixtureId, kickoffAt, homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
    family: pick.family, selection, probability: pick.probability, odds: displayMarketOddsPrice(offer.decimal), oddsBasis: "bookmaker",
    source: pick.source, bookmaker: { id: offer.bookmakerId, name: offer.bookmakerName }, offer,
    forecast: { cycleId, revisionId: forecast.revisionId, publishedAt: forecast.publishedAt } };
}

export async function readFeaturedSlipSelections(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], at: number) {
  const upcoming = records.filter(({ forecast, kickoffAt }) => forecast && kickoffAt !== null && at < getPublicationDeadline(kickoffAt));
  if (!upcoming.length) return [];
  const [goals, quotes, total15] = await Promise.all([
    readFeaturedGoalMarkets(tx, upcoming.map(({ forecast }) => forecast!.revisionId)),
    storedCurrentBookmakerQuotes(tx, upcoming, at, localFeaturedBookmakerBetIds),
    storedSlipTotal15Forecasts(tx, upcoming, at),
  ]);
  return upcoming.flatMap((record) => {
    const selection = reviewedFeaturedSlipSelection(record, goals.get(record.forecast!.revisionId), quotes.get(record.fixtureId), total15[record.fixtureId], at);
    return selection ? [selection] : [];
  });
}

/** The fixture locks are already held. Hold the current odds state through the publication commit. */
export async function verifyFeaturedSlipOffers(tx: Prisma.TransactionClient, selections: readonly SlipSelection[], at: number) {
  const ids = selections.map(({ fixtureId }) => fixtureId).sort();
  const locked = await tx.$queryRaw<{ fixtureId: string }[]>(Prisma.sql`SELECT fixtureId FROM FixtureOddsState
    WHERE fixtureId IN (${Prisma.join(ids)}) ORDER BY fixtureId LOCK IN SHARE MODE`);
  if (locked.length !== ids.length) return false;
  const quotes = await storedCurrentBookmakerQuotes(tx, selections, at, localFeaturedBookmakerBetIds);
  return selections.every(({ fixtureId, family, selection, offer }) => {
    if (!offer) return false;
    const [marketKey, choice] = isTotal15SlipSelection(selection) ? [total15MarketKey, total15Direction(selection)] : [family, selection];
    const current = exactOffer(quotes.get(fixtureId), marketKey, choice, offer.bookmakerId, at);
    return current !== null && evidenceFingerprint(current) === evidenceFingerprint(offer);
  });
}
