import "server-only";

import type { MarketOddsObservation } from "../../domain/in-play-odds.ts";
import { matchFeedRules, type StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { storedInPlayOddsForFixtures } from "../odds/in-play-odds-read.ts";
import { storedUpcomingOddsForFixtures } from "../odds/odds-read.ts";

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
