import "server-only";

import { getPublicationDeadline } from "../../domain/calendar.ts";
import { total15MarketKey } from "../../domain/extended-markets.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import { inspectLocalFeaturedQuote, localFeaturedBookmakerBetIds, localFeaturedQuoteScopeReason,
  verifiedLocalFeaturedBinding } from "../../domain/local-featured-decision.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { additionalSlipGoalMarket, additionalSlipGoalSelection, isSlipMarketSelection, isTotal15SlipSelection,
  total15Direction, type SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import { editorialSlipOfferSchema, type EditorialSlipOffer } from "../../domain/slip-quote.ts";
import type { SlipForecastReference, SlipSelection } from "../../domain/slip-builder.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { upcomingFeaturedPick } from "../matches/upcoming-featured-pick.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { readFeaturedGoalMarkets, type FeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { storedRevisions } from "../predictions/history-read.ts";
import { qualifiedEditorialSlipRevision } from "./slip-forecast.ts";
import { readSlipGoalExtensions, storedSlipTotal15Forecasts } from "./slip-goal-forecast.ts";

type QuoteOccurrence = Readonly<{ fixtureId: string; kickoffAt: number }>;
type Bookmaker = StoredCurrentBookmakerQuotes["bookmakers"][number];
type MarketBinding = NonNullable<ReturnType<typeof verifiedLocalFeaturedBinding>>;
type PricedFeaturedSelection = SlipSelection & { forecast: SlipForecastReference; offer: EditorialSlipOffer };

function exactOffer(book: Bookmaker, binding: MarketBinding, at: number): EditorialSlipOffer | null {
  const markets = book.offers.filter(({ betId, betName }) => betId === binding.betId && betName === binding.betName);
  if (markets.length !== 1) return null;
  const market = markets[0]!;
  const values = market.values.filter(({ label }) => label === binding.label);
  if (values.length !== 1) return null;
  const inspected = inspectLocalFeaturedQuote(book, market, values[0]!, at);
  if (!("quote" in inspected)) return null;
  const result = editorialSlipOfferSchema.safeParse(inspected.quote);
  return result.success ? result.data : null;
}

function exactOffers(quotes: StoredCurrentBookmakerQuotes | undefined, occurrence: QuoteOccurrence,
  marketKey: string, selection: string, at: number): ReadonlyMap<number, EditorialSlipOffer | null> {
  const offers = new Map<number, EditorialSlipOffer | null>();
  const binding = verifiedLocalFeaturedBinding(marketKey, selection);
  if (!quotes || !binding || localFeaturedQuoteScopeReason({ ...occurrence, quotes, decisionAt: at, quotesPermitted: true })) return offers;
  for (const book of quotes.bookmakers) {
    const id = book.bookmakerId;
    offers.set(id, offers.has(id) ? null : exactOffer(book, binding, at));
  }
  return offers;
}

function featuredSlipCandidates(record: StoredMatchFeedRecord, goals: FeaturedGoalMarkets | undefined,
  quotes: StoredCurrentBookmakerQuotes | undefined, total15: SlipTotal15Forecast | undefined, at: number,
  includeAdditionalGoals: boolean): PricedFeaturedSelection[] {
  const { forecast, fixtureId, kickoffAt, cycleId } = record;
  if (!forecast || forecast.updateDelayed || forecast.publishedAt > at || !cycleId || kickoffAt === null ||
    forecast.publishedAt >= getPublicationDeadline(kickoffAt) || record.status !== "scheduled" || record.cycle?.state !== "open" ||
    record.cycle.mode !== "current" || record.update.prediction !== "current") return [];
  const pick = upcomingFeaturedPick(record, goals, quotes, at, true);
  if (!pick?.featuredQuote || !pick.odds || pick.source !== "local-engine") return [];
  const additional = includeAdditionalGoals ? additionalSlipGoalMarket(pick.key) : undefined;
  if (additional && pick.selection !== "over" && pick.selection !== "under") return [];
  if (!additional && pick.key !== pick.family && pick.key !== total15MarketKey) return [];
  const family = additional?.family ?? pick.family;
  const selection = additional ? pick.selection === "over" ? additional.over : additional.under
    : pick.key === total15MarketKey ? `${pick.selection}-1.5` : pick.selection;
  if (!isSlipMarketSelection(family, selection)) return [];
  // Additional totals are checked against the sealed goal extension after exact prices are established.
  if (!additional) {
    const market = forecast.markets.find((entry) => entry.market.family === pick.family);
    const supported = isTotal15SlipSelection(selection) ? total15?.source === "local-poisson" && total15.probabilities[selection] === pick.probability
      : market?.market.source === pick.source && (!market.outcome || market.outcome.status === "pending") &&
        (market.market.probabilities as Readonly<Record<string, number>>)[selection] === pick.probability;
    if (!supported) return [];
  }
  const offers = exactOffers(quotes, { fixtureId, kickoffAt }, pick.key, pick.selection, at);
  // First prove the site's featured price. Alternatives can only price that same outcome.
  if (offers.get(pick.featuredQuote.bookmakerId)?.decimal !== pick.odds) return [];
  return [...offers.values()].flatMap((offer): PricedFeaturedSelection[] => !offer ? [] : [
    { fixtureId, kickoffAt, homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
      family, selection, probability: pick.probability, odds: displayMarketOddsPrice(offer.decimal), oddsBasis: "bookmaker",
      source: pick.source, bookmaker: { id: offer.bookmakerId, name: offer.bookmakerName }, offer,
      forecast: { cycleId, revisionId: forecast.revisionId, publishedAt: forecast.publishedAt } },
  ]);
}

async function readFeaturedSlipInputs(tx: Prisma.TransactionClient, upcoming: readonly StoredMatchFeedRecord[], at: number) {
  const [goals, quotes, total15] = await Promise.all([
    readFeaturedGoalMarkets(tx, upcoming.map(({ forecast }) => forecast!.revisionId)),
    storedCurrentBookmakerQuotes(tx, upcoming, at, localFeaturedBookmakerBetIds),
    storedSlipTotal15Forecasts(tx, upcoming, at),
  ]);
  return { goals, quotes, total15 };
}

export async function readFeaturedSlipSelections(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], at: number,
  readInputs = readFeaturedSlipInputs, includeAdditionalGoals = false) {
  const upcoming = records.filter(({ forecast, kickoffAt }) => forecast && kickoffAt !== null && at < getPublicationDeadline(kickoffAt));
  if (!upcoming.length) return [];
  const { goals, quotes, total15 } = await readInputs(tx, upcoming, at);
  const priced = upcoming.flatMap((record) => featuredSlipCandidates(record, goals.get(record.forecast!.revisionId),
    quotes.get(record.fixtureId), total15[record.fixtureId], at, includeAdditionalGoals));
  const additionalRevisions = [...new Set(priced.flatMap(({ selection, forecast }) =>
    additionalSlipGoalSelection(selection) ? [forecast.revisionId] : []))];
  const [revisions, extensions] = await Promise.all([
    storedRevisions(tx, priced.map(({ forecast }) => forecast.revisionId)), readSlipGoalExtensions(tx, additionalRevisions),
  ]);
  return priced.filter((selection) => {
    const { revisionId } = selection.forecast;
    return qualifiedEditorialSlipRevision(selection, revisions.get(revisionId), extensions.get(revisionId), at);
  });
}

export async function lockFeaturedSlipOdds(tx: Prisma.TransactionClient, fixtureIds: readonly string[]) {
  if (!fixtureIds.length) return [];
  return tx.$queryRaw<{ fixtureId: string }[]>(Prisma.sql`SELECT fixtureId FROM FixtureOddsState
    WHERE fixtureId IN (${Prisma.join([...fixtureIds].sort())}) ORDER BY fixtureId LOCK IN SHARE MODE`);
}

/** The fixture locks are already held. Hold the current odds state through the publication commit. */
export async function verifyFeaturedSlipOffers(tx: Prisma.TransactionClient, selections: readonly SlipSelection[], at: number,
  readQuotes = storedCurrentBookmakerQuotes) {
  if (!selections.length) return false;
  const ids = [...new Set(selections.map(({ fixtureId }) => fixtureId))];
  const locked = await lockFeaturedSlipOdds(tx, ids);
  if (locked.length !== ids.length) return false;
  const quotes = await readQuotes(tx, selections, at, localFeaturedBookmakerBetIds);
  return selections.every(({ fixtureId, kickoffAt, family, selection, offer }) => {
    const additional = additionalSlipGoalSelection(selection);
    if (!offer || additional && additional.family !== family) return false;
    const [marketKey, choice] = additional ? [additional.key, selection === additional.over ? "over" : "under"]
      : isTotal15SlipSelection(selection) ? [total15MarketKey, total15Direction(selection)] : [family, selection];
    const current = exactOffers(quotes.get(fixtureId), { fixtureId, kickoffAt }, marketKey, choice, at).get(offer.bookmakerId);
    return !!current && evidenceFingerprint(current) === evidenceFingerprint(offer);
  });
}
