import "server-only";

import type { MarketOddsObservation } from "../../domain/in-play-odds.ts";
import { matchFeedRules, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { storedInPlayOddsForFixtures } from "../odds/in-play-odds-read.ts";
import { storedUpcomingOddsForFixtures } from "../odds/odds-read.ts";
import { storedCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import { readFeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import { rankFixtureOutcomes } from "../../domain/market-ranking.ts";
import { featuredBookmakerBetIds } from "../../domain/bookmaker-odds.ts";

/** Feature a current outcome across the complete stored goal and launch forecasts. */
export async function withUpcomingFeaturedOutcomes(database: DatabaseRuntime, response: StoredMatchFeedResponse, asOf: number, providerOdds: boolean) {
  const fixtures = response.records.filter(({ status, kickoffAt, forecast }) => status === "scheduled" && kickoffAt !== null && kickoffAt > asOf && !!forecast);
  if (!fixtures.length) return response;
  const [goals, quotes] = await Promise.all([
    database.query((tx) => readFeaturedGoalMarkets(tx, fixtures.map(({ forecast }) => forecast!.revisionId))).catch(() => null),
    providerOdds ? database.transaction((tx) => storedCurrentBookmakerQuotes(tx, fixtures, asOf, featuredBookmakerBetIds),
      { isolationLevel: "RepeatableRead", maxWait: 2000, timeout: 5000 }).catch(() => null) : null,
  ]);
  const featured = new Map(fixtures.map((record) => [record.fixtureId, rankFixtureOutcomes(record.forecast!.markets,
    goals?.get(record.forecast!.revisionId) ?? [], projectBookmakerOdds(quotes?.get(record.fixtureId), "pre-match"), record.marketOdds)]));
  const records = response.records.map((record) => featured.has(record.fixtureId)
    ? { ...record, featuredPrediction: featured.get(record.fixtureId) ?? null } : record);
  const projected = { ...response, records };
  return Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes ? freezeEvidence(projected) : response;
}

/** Current odds are observed independently of cached fixture and forecast content. */
export async function withCurrentFeedOdds(database: DatabaseRuntime, response: StoredMatchFeedResponse, asOf: number, allowInPlay: boolean)
  : Promise<StoredMatchFeedResponse> {
  const scheduled: string[] = [], playing: string[] = [];
  for (const { fixtureId, kickoffAt, status } of response.records) {
    if (status === "scheduled" && kickoffAt !== null && kickoffAt > asOf) scheduled.push(fixtureId);
    else if (allowInPlay && status === "live") playing.push(fixtureId);
  }
  const [upcoming, live] = await Promise.all([
    scheduled.length ? database.query((tx) => storedUpcomingOddsForFixtures(tx, scheduled, asOf)).catch(() => []) : [],
    playing.length ? database.query((tx) => storedInPlayOddsForFixtures(tx, playing, asOf)).catch(() => []) : [],
  ]);
  const observations = new Map<string, { kickoffAt: number; observation: MarketOddsObservation }>(
    upcoming.map(({ fixtureId, kickoffAt, observation }) => [fixtureId, { kickoffAt, observation }]),
  );
  for (const { fixtureId, kickoffAt, checkedAt, prices } of live)
    observations.set(fixtureId, { kickoffAt, observation: { kind: "in-play", checkedAt, prices } });
  if (!observations.size) return response;
  const records = response.records.map((record) => {
    const entry = observations.get(record.fixtureId);
    return entry && entry.kickoffAt === record.kickoffAt ? { ...record, marketOdds: entry.observation } : record;
  });
  const projected = { ...response, records };
  return Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes ? freezeEvidence(projected) : response;
}
