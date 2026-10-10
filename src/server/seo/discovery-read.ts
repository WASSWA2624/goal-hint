import "server-only";
import { z } from "zod";
import { discoveryRules } from "../../domain/discovery.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import { parseReportingDate } from "../../domain/calendar.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { publicFixtureScope } from "../matches/feed-read.ts";

export type DiscoveryEntry = Readonly<{ path: string; lastModified?: Date }>;
export type DiscoveryReader = Readonly<{
  inventory(): Promise<{ matches: number; dates: number }>;
  matches(page: number): Promise<DiscoveryEntry[]>;
  dates(page: number): Promise<DiscoveryEntry[]>;
}>;
const joins = Prisma.sql`FROM FootballFixture f JOIN FootballSeason s ON s.id=f.seasonId
  JOIN FootballCompetition l ON l.id=s.competitionId LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id`;

export function createDiscoveryReader(database: DatabaseRuntime, competitionIds: readonly number[]): DiscoveryReader {
  const ids = z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(1000).parse(competitionIds);
  if (new Set(ids).size !== ids.length) throw new RangeError("Invalid discovery scope.");
  const scope = publicFixtureScope(ids), size = discoveryRules.sitemapBatchSize;
  function offset(page: number) {
    if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(page * size)) throw new RangeError("Invalid discovery page.");
    return page * size;
  }
  return Object.freeze({
    async inventory() {
      return database.transaction(async tx => {
        const [row] = await tx.$queryRaw<{ matches: bigint; dates: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS matches, COUNT(DISTINCT CASE WHEN f.kickoff IS NOT NULL THEN f.eatDate END) AS dates ${joins} WHERE ${scope}`);
        const matches = Number(row!.matches), dates = Number(row!.dates);
        if (!Number.isSafeInteger(matches) || !Number.isSafeInteger(dates)) throw new RangeError("Discovery inventory is too large.");
        return { matches, dates };
      }, { isolationLevel: "RepeatableRead" });
    },
    async matches(page: number) {
      const start = offset(page);
      return database.transaction(async tx => {
        const rows = await tx.$queryRaw<{ id: string; home: string | null; away: string | null; modified: Date }[]>(Prisma.sql`
          SELECT f.id, h.name AS home, a.name AS away,
            GREATEST(f.createdAt, COALESCE((SELECT MAX(fa.observedAt) FROM FootballFixtureAudit fa WHERE fa.fixtureId=f.id), f.createdAt),
              COALESCE((SELECT MAX(e.at) FROM PredictionChangeEvent e WHERE e.fixtureId=f.id), f.createdAt)) AS modified
          ${joins} JOIN FootballTeam h ON h.id=f.homeTeamId JOIN FootballTeam a ON a.id=f.awayTeamId
          WHERE ${scope} ORDER BY f.id LIMIT ${size} OFFSET ${start}`);
        return rows.map(row => ({ path: matchHref(row.id, canonicalMatchSlug(row.home, row.away)), lastModified: row.modified }));
      }, { isolationLevel: "RepeatableRead" });
    },
    async dates(page: number) {
      const start = offset(page);
      return database.transaction(async tx => {
        const rows = await tx.$queryRaw<{ date: string }[]>(Prisma.sql`SELECT DISTINCT DATE_FORMAT(f.eatDate, '%Y-%m-%d') AS date
          ${joins} WHERE ${scope} AND f.kickoff IS NOT NULL AND f.eatDate IS NOT NULL ORDER BY date LIMIT ${size} OFFSET ${start}`);
        // Pagination remains discoverable through its ordinary next/previous links.
        // No guessed page counts, empty dates or filtered URLs are advertised.
        return rows.map(row => ({ path: `/en/predictions/${parseReportingDate(row.date)}` }));
      }, { isolationLevel: "RepeatableRead" });
    },
  });
}

export function readPublicDiscovery(): DiscoveryReader {
  return createDiscoveryReader(getDatabase(), getRuntimePolicy().choices.competitionIds ?? []);
}
