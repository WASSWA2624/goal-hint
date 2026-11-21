import "server-only";

import { z } from "zod";
import { feedMarketPickId, feedMarketPickIdentity, type FeedMarketPick } from "../../domain/feed-market-picks.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { playedFinalFixtureStatuses } from "../../domain/market-settlement.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { activeNovemberReplaySql, readNovemberReplayProjections } from "../intelligence/november-replay-store.ts";
import { MatchFeedError } from "./feed-error.ts";
import { displayedSet, exactExtendedFeedPickSource, exactLegacyFeedPickSource, feedFixtureRelations, publicFixtureScope } from "./feed-read.ts";

const competitionScope = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope);

/** Read from published revision indexes so fixture-only seasons do not enter the catalog scan. */
export async function readStoredFeedMarkets(database: DatabaseRuntime, competitionIds: readonly number[], finishedOnly: boolean) {
  const scope = competitionScope.safeParse(competitionIds);
  if (!scope.success || new Set(scope.data).size !== scope.data.length) throw new MatchFeedError("unavailable");

  const visible = Prisma.sql`${publicFixtureScope(scope.data)}
    ${finishedOnly ? Prisma.sql`AND f.status IN (${Prisma.join(playedFinalFixtureStatuses)})` : Prisma.empty}`;
  return database.transaction(async (tx) => {
    const originals = Prisma.sql`FROM PredictionSet rp STRAIGHT_JOIN FootballFixture f ON f.id=rp.fixtureId
      ${feedFixtureRelations} LEFT JOIN ${activeNovemberReplaySql} replay ON replay.fixtureId=f.id`;
    const originalScope = Prisma.sql`${visible} AND rp.id=${displayedSet} AND replay.fixtureId IS NULL`;
    const legacy = await tx.$queryRaw<{ family: string; selection: string }[]>(Prisma.sql`
      SELECT DISTINCT STRAIGHT_JOIN mp.family, mp.selection
      ${originals} JOIN MarketPrediction mp ON mp.setId=rp.id
      WHERE ${originalScope} AND ${exactLegacyFeedPickSource}`);
    const extended = await tx.$queryRaw<{ marketKey: string; selection: string }[]>(Prisma.sql`
      SELECT DISTINCT STRAIGHT_JOIN ep.marketKey, ep.selection
      ${originals} JOIN ExtendedMarketPublishedPick ep ON ep.revisionId=rp.id
      WHERE ${originalScope} AND ${exactExtendedFeedPickSource}`);
    const replays = await tx.$queryRaw<{ fixtureId: string }[]>(Prisma.sql`SELECT replay.fixtureId
      FROM ${activeNovemberReplaySql} replay JOIN FootballFixture f ON f.id=replay.fixtureId
      ${feedFixtureRelations} WHERE ${visible}`);
    const projections = await readNovemberReplayProjections(tx, replays.map(({ fixtureId }) => fixtureId));

    const marketPicks = new Set<FeedMarketPick>();
    for (const { family, selection } of legacy) {
      const identity = feedMarketPickIdentity(`${family}:${selection}`);
      if (identity) marketPicks.add(identity.id);
    }
    for (const { marketKey, selection } of extended) {
      const id = feedMarketPickId(marketKey, selection);
      if (id) marketPicks.add(id);
    }
    for (const { markets } of projections.values()) {
      for (const { definition, selected, selections } of markets) {
        for (const { key } of selections ?? [{ key: selected.selection }]) {
          const id = feedMarketPickId(definition.key, key);
          if (id) marketPicks.add(id);
        }
      }
    }
    return [...marketPicks].sort();
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 20_000 });
}

const reads = new Map<boolean, Promise<readonly FeedMarketPick[]>>();
export function readPublishedFeedMarkets(finishedOnly: boolean) {
  const existing = reads.get(finishedOnly);
  if (existing) return existing;
  const read = readStoredFeedMarkets(getDatabase(), getRuntimePolicy().choices.competitionIds ?? [], finishedOnly)
    .finally(() => reads.delete(finishedOnly));
  reads.set(finishedOnly, read);
  return read;
}
