import "server-only";

import { getPublicationDeadline } from "../../domain/calendar.ts";
import { total15MarketKey, type FeaturedPrediction } from "../../domain/extended-markets.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import { decideLocalFeaturedPick, inspectExactLocalFeaturedQuote, localFeaturedBookmakerBetIds, localFeaturedQuoteScopeReason,
  verifiedLocalFeaturedBinding } from "../../domain/local-featured-decision.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { additionalSlipGoalMarket, additionalSlipGoalSelection, isSlipMarketSelection, isTotal15SlipSelection,
  total15Direction, type SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import { editorialSlipOfferSchema, type EditorialSlipOffer } from "../../domain/slip-quote.ts";
import type { SlipForecastReference, SlipSelection } from "../../domain/slip-builder.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { collectUpcomingLocalFeaturedCandidates, upcomingFeaturedPick } from "../matches/upcoming-featured-pick.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { projectFeaturedGoalMarkets, readFeaturedGoalMarkets, type FeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { storedRevisions } from "../predictions/history-read.ts";
import { qualifiedEditorialSlipRevision } from "./slip-forecast.ts";
import { projectSlipTotal15Forecast, readSlipGoalExtensions, storedSlipTotal15Forecasts } from "./slip-goal-forecast.ts";

type QuoteOccurrence = Readonly<{ fixtureId: string; kickoffAt: number }>;
type Bookmaker = StoredCurrentBookmakerQuotes["bookmakers"][number];
type MarketBinding = NonNullable<ReturnType<typeof verifiedLocalFeaturedBinding>>;
type PricedFeaturedSelection = SlipSelection & { forecast: SlipForecastReference; offer: EditorialSlipOffer };

function exactOffer(book: Bookmaker, binding: MarketBinding, at: number): EditorialSlipOffer | null {
  const inspected = inspectExactLocalFeaturedQuote(book, binding, at);
  if (!inspected || !("quote" in inspected)) return null;
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

function currentFeaturedSlipForecast(record: StoredMatchFeedRecord, at: number) {
  const { forecast, fixtureId, kickoffAt, cycleId } = record;
  if (!forecast || forecast.updateDelayed || forecast.publishedAt > at || !cycleId || kickoffAt === null ||
    forecast.publishedAt >= getPublicationDeadline(kickoffAt) || record.status !== "scheduled" || record.cycle?.state !== "open" ||
    record.cycle.mode !== "current" || record.update.prediction !== "current" || at >= getPublicationDeadline(kickoffAt)) return null;
  return { fixtureId, kickoffAt, homeTeam: record.homeTeam, awayTeam: record.awayTeam,
    forecast: { cycleId, revisionId: forecast.revisionId, publishedAt: forecast.publishedAt } };
}

type SlipFeaturedPick = Pick<FeaturedPrediction, "key" | "family" | "selection" | "probability" | "source">;

function supportedFeaturedSlipPick(forecast: NonNullable<StoredMatchFeedRecord["forecast"]>, pick: SlipFeaturedPick,
  total15: SlipTotal15Forecast | undefined, includeAdditionalGoals: boolean) {
  if (pick.source !== "local-engine") return null;
  const additional = includeAdditionalGoals ? additionalSlipGoalMarket(pick.key) : undefined;
  if (additional && pick.selection !== "over" && pick.selection !== "under") return null;
  if (!additional && pick.key !== pick.family && pick.key !== total15MarketKey) return null;
  const family = additional?.family ?? pick.family;
  const selection = additional ? pick.selection === "over" ? additional.over : additional.under
    : pick.key === total15MarketKey ? `${pick.selection}-1.5` : pick.selection;
  if (!isSlipMarketSelection(family, selection)) return null;
  // Additional totals are checked against the sealed goal extension after exact prices are established.
  if (!additional) {
    const market = forecast.markets.find((entry) => entry.market.family === pick.family);
    const supported = isTotal15SlipSelection(selection) ? total15?.source === "local-poisson" && total15.probabilities[selection] === pick.probability
      : market?.market.source === pick.source && (!market.outcome || market.outcome.status === "pending") &&
        (market.market.probabilities as Readonly<Record<string, number>>)[selection] === pick.probability;
    if (!supported) return null;
  }
  return { family, selection, probability: pick.probability, source: pick.source };
}

function featuredSlipCandidates(record: StoredMatchFeedRecord, goals: FeaturedGoalMarkets | undefined,
  quotes: StoredCurrentBookmakerQuotes | undefined, total15: SlipTotal15Forecast | undefined, at: number,
  includeAdditionalGoals: boolean): PricedFeaturedSelection[] {
  const reference = currentFeaturedSlipForecast(record, at);
  if (!reference) return [];
  const pick = upcomingFeaturedPick(record, goals, quotes, at, true);
  if (!pick?.featuredQuote || !pick.odds) return [];
  const supported = supportedFeaturedSlipPick(record.forecast!, pick, total15, includeAdditionalGoals);
  if (!supported) return [];
  const offers = exactOffers(quotes, reference, pick.key, pick.selection, at);
  // First prove the site's featured price. Alternatives can only price that same outcome.
  const chosen = offers.get(pick.featuredQuote.bookmakerId);
  if (!chosen) return [];
  const { snapshotId: _snapshotId, receiptId: _receiptId, ...featuredQuote } = chosen;
  void _snapshotId; void _receiptId;
  if (evidenceFingerprint(featuredQuote) !== evidenceFingerprint(pick.featuredQuote)) return [];
  return [...offers.values()].flatMap((offer): PricedFeaturedSelection[] => !offer ? [] : [
    { ...reference, ...supported, competition: record.competition, odds: displayMarketOddsPrice(offer.decimal), oddsBasis: "bookmaker",
      bookmaker: { id: offer.bookmakerId, name: offer.bookmakerName }, offer },
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

/** Find forecast-qualified fixtures that could supply a supported featured pick if a suitable quote arrives. */
export async function readPotentialFeaturedSlipFixtures(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], at: number) {
  const current = records.flatMap((record) => {
    const reference = currentFeaturedSlipForecast(record, at);
    return reference ? [{ record, reference }] : [];
  });
  if (!current.length) return [];
  const revisionIds = current.map(({ reference }) => reference.forecast.revisionId);
  const [revisions, extensions] = await Promise.all([storedRevisions(tx, revisionIds), readSlipGoalExtensions(tx, revisionIds)]);
  return current.flatMap(({ record, reference }) => {
    const { revisionId } = reference.forecast;
    const extension = extensions.get(revisionId) ?? null;
    const total15 = projectSlipTotal15Forecast(extension, reference.fixtureId, reference.kickoffAt, reference.forecast, at) ?? undefined;
    const goals = extension ? projectFeaturedGoalMarkets(extension.markets) : undefined;
    const outcomes = collectUpcomingLocalFeaturedCandidates(record.forecast, goals)?.flatMap(({ outcome, pick }) => {
      if (!verifiedLocalFeaturedBinding(outcome.marketKey, outcome.selection)) return [];
      const supported = supportedFeaturedSlipPick(record.forecast!, { ...pick, probability: outcome.settlementProbabilities.win },
        total15, true);
      return supported && qualifiedEditorialSlipRevision({ ...reference, ...supported }, revisions.get(revisionId), extension, at)
        ? [outcome] : [];
    });
    const decision = decideLocalFeaturedPick({ ...reference, decisionAt: at, outcomes: outcomes ?? [], quotes: null, quotesPermitted: true });
    return decision.status === "forecast-only" ? [record.fixtureId] : [];
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
