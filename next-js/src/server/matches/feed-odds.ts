import "server-only";

import { displayMarketOddsPrice, type MarketOddsObservation } from "../../domain/in-play-odds.ts";
import { matchFeedRules, type StoredMatchFeedRecord, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { recommendationMarket } from "../../domain/recommendation-view.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { timedRequestPhase } from "../http/request-timing.ts";
import { storedInPlayOddsForFixtures } from "../odds/in-play-odds-read.ts";
import { storedUpcomingOddsForFixtures } from "../odds/odds-read.ts";
import { storedCurrentBookmakerQuotes, storedRecoveredBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import { readFeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { localFeaturedBookmakerBetIds } from "../../domain/local-featured-decision.ts";
import { bookmakerMarketQuote, featuredBookmakerBetIds } from "../../domain/bookmaker-odds.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readReplayBookmakerQuotes, replayPickPricing } from "./retrospective-picks.ts";
import { upcomingFeaturedPick } from "./upcoming-featured-pick.ts";

/** Feature a current outcome across the complete stored goal and launch forecasts. */
export async function withUpcomingFeaturedOutcomes(database: DatabaseRuntime, response: StoredMatchFeedResponse, asOf: number, providerOdds: boolean) {
  const fixtures = response.records.filter(({ status, kickoffAt, forecast, featuredDecisionFrozen }) =>
    status === "scheduled" && kickoffAt !== null && kickoffAt > asOf && !!forecast && !featuredDecisionFrozen);
  if (!fixtures.length) return response;
  const [goals, quotes] = await Promise.all([
    database.query((tx) => readFeaturedGoalMarkets(tx, fixtures.map(({ forecast }) => forecast!.revisionId))).catch(() => null),
    providerOdds ? database.transaction((tx) => storedCurrentBookmakerQuotes(tx, fixtures, asOf, localFeaturedBookmakerBetIds),
      { isolationLevel: "RepeatableRead", maxWait: 2000, timeout: 5000 }).catch(() => null) : null,
  ]);
  const featured = new Map(fixtures.map((record) => [record.fixtureId, upcomingFeaturedPick(record,
    goals === null ? null : goals.get(record.forecast!.revisionId), quotes?.get(record.fixtureId), asOf, providerOdds)]));
  const records = response.records.map((record) => featured.has(record.fixtureId)
    ? { ...record, featuredPrediction: featured.get(record.fixtureId) ?? null } : record);
  const projected = { ...response, records };
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes) return freezeEvidence(projected);
  const compact = { ...projected, records: records.map((record) => record.marketOdds ? { ...record, marketOdds: null } : record) };
  if (Buffer.byteLength(JSON.stringify(compact), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
  return freezeEvidence(compact);
}

function recoveredPrices(record: StoredMatchFeedRecord, quotes: StoredCurrentBookmakerQuotes | undefined, preferRecommendation: boolean) {
  const { forecast } = record;
  if (!quotes || quotes.kickoffAt !== record.kickoffAt || !forecast) return record.prices;
  const odds = projectBookmakerOdds(quotes, "historical-pre-match");
  if (!odds) return record.prices;
  const kickoffAt = utcInstantFromEpochMilliseconds(odds.kickoffAt);
  const existing = new Set(record.prices.map(({ family }) => family));
  const recovered = forecast.markets.flatMap(({ market }) => {
    const { family, selection } = recommendationMarket(market, preferRecommendation ? forecast.recommendation : undefined);
    if (existing.has(family)) return [];
    const quote = bookmakerMarketQuote(odds, family, selection);
    if (quote?.state !== "available" || quote.offer.price === null || quote.actualBookmakerId === null) return [];
    const { observedAt, providerUpdatedAt } = quote.offer;
    return [{ family, selection, price: displayMarketOddsPrice(quote.offer.price), basis: "bookmaker" as const,
      retrievedAt: utcInstantFromEpochMilliseconds(observedAt),
      providerUpdatedAt: providerUpdatedAt === null ? null : utcInstantFromEpochMilliseconds(providerUpdatedAt),
      recovery: { kind: "historical-pre-match" as const, bookmakerId: quote.actualBookmakerId, kickoffAt } }];
  });
  return recovered.length ? [...record.prices, ...recovered] : record.prices;
}

/** Live, upcoming and recovered prices have independent stored observation clocks. */
export async function withFeedOdds(database: DatabaseRuntime, response: StoredMatchFeedResponse, asOf: number, allowInPlay: boolean,
  preferRecommendation = true)
  : Promise<StoredMatchFeedResponse> {
  const scheduled: string[] = [], playing: string[] = [];
  for (const { fixtureId, kickoffAt, status } of response.records) {
    if (status === "scheduled" && kickoffAt !== null && kickoffAt > asOf) scheduled.push(fixtureId);
    else if (allowInPlay && status === "live") playing.push(fixtureId);
  }
  const started = response.records.filter(({ status, kickoffAt, forecast, prices }) => kickoffAt !== null && kickoffAt <= asOf &&
    (status === "live" || isPlayedFinalStatus(status)) && forecast !== null && prices.length < forecast.markets.length);
  const replays = response.records.filter(({ retrospective }) => retrospective && !retrospective.featuredDecisionSealed);
  const [upcoming, live, recovered, replayQuotes] = await Promise.all([
    scheduled.length ? timedRequestPhase("odds-upcoming",
      () => database.query((tx) => storedUpcomingOddsForFixtures(tx, scheduled, asOf))).catch(() => []) : [],
    playing.length ? timedRequestPhase("odds-in-play",
      () => database.query((tx) => storedInPlayOddsForFixtures(tx, playing, asOf))).catch(() => []) : [],
    started.length ? timedRequestPhase("odds-recovered", () => database.transaction(
      (tx) => storedRecoveredBookmakerQuotes(tx, started, asOf, featuredBookmakerBetIds),
      { isolationLevel: "RepeatableRead", maxWait: 2_000, timeout: 5_000 })).catch(() => null) : null,
    replays.length ? timedRequestPhase("odds-replay", () => readReplayBookmakerQuotes(database, replays, asOf)) : null,
  ]);
  const observations = new Map<string, { kickoffAt: number; observation: MarketOddsObservation }>(
    upcoming.map(({ fixtureId, kickoffAt, observation }) => [fixtureId, { kickoffAt, observation }]),
  );
  for (const { fixtureId, kickoffAt, checkedAt, prices } of live)
    observations.set(fixtureId, { kickoffAt, observation: { kind: "in-play", checkedAt, prices } });
  if (!observations.size && !recovered?.size && !replayQuotes?.size) return response;
  let latestReplayQuoteAt = response.asOf;
  const records = response.records.map((record) => {
    const entry = observations.get(record.fixtureId);
    const prices = recoveredPrices(record, recovered?.get(record.fixtureId), preferRecommendation);
    const marketOdds = entry && entry.kickoffAt === record.kickoffAt ? entry.observation : record.marketOdds;
    const replay = record.retrospective, quotes = replayQuotes?.get(record.fixtureId);
    const replayPick = replay && !replay.featuredDecisionSealed && quotes?.kickoffAt === record.kickoffAt ? replayPickPricing(quotes)(replay.pick) : null;
    if (replayPick?.historicalOdds && replayPick.historicalOdds.observedAt > latestReplayQuoteAt)
      latestReplayQuoteAt = utcInstantFromEpochMilliseconds(replayPick.historicalOdds.observedAt);
    const retrospective = replay && replayPick && replayPick !== replay.pick ? { ...replay, pick: replayPick } : replay;
    return prices === record.prices && marketOdds === record.marketOdds && retrospective === replay ? record
      : { ...record, prices, marketOdds, ...(retrospective !== replay ? { retrospective } : {}) };
  });
  const projected = { ...response, asOf: latestReplayQuoteAt, records };
  return Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes ? freezeEvidence(projected) : response;
}
