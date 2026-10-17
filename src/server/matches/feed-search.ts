import "server-only";

import type { ReportingDateRange } from "../../domain/calendar.ts";
import { prepareFootballSearch } from "../../domain/football-search.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "./feed-error.ts";
import { publicFixtureCohortScope } from "./feed-read.ts";

export const feedSearchRules = Object.freeze({ maximumCatalogRows: 50_000, maximumIdentities: 10_000 });
export type RankedFeedIdentity = Readonly<{ id: string; score: number }>;
export type FeedSearch = Readonly<{
  query: string;
  teams: readonly RankedFeedIdentity[];
  competitions: readonly RankedFeedIdentity[];
}>;
type CatalogRow = { kind: "team" | "competition"; id: string; name: string | null; country: string | null; alias: string | null };

/** Resolve catalog identities before SQL pagination; fixture rows never enter the fuzzy matcher.
 * Alias joins follow deduplicated entities, so home/away aliases cannot multiply each other.
 * Explicit bounds fail closed rather than returning a truncated search cohort on a shared host. */
export async function storedFeedSearch(tx: Prisma.TransactionClient, search: string, range: ReportingDateRange,
  competitionIds: readonly number[]): Promise<FeedSearch | null> {
  if (!search) return null;
  const prepared = prepareFootballSearch(search);
  const teams = new Map<string, number>(), competitions = new Map<string, number>();
  if (prepared.tokens.length > 0) {
    const rows = await tx.$queryRaw<CatalogRow[]>(Prisma.sql`
      WITH cohort AS (
        SELECT DISTINCT f.homeTeamId, f.awayTeamId, l.id AS competitionId
        FROM FootballFixture f JOIN FootballSeason s ON s.id=f.seasonId
        JOIN FootballCompetition l ON l.id=s.competitionId
        LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
        WHERE ${publicFixtureCohortScope(range, competitionIds)}
      ), teams AS (
        SELECT homeTeamId AS id FROM cohort UNION SELECT awayTeamId AS id FROM cohort
      ), competitions AS (
        SELECT DISTINCT competitionId AS id FROM cohort
      )
      SELECT 'team' AS kind, t.id, t.name, t.country, ta.name AS alias
      FROM teams e JOIN FootballTeam t ON t.id=e.id LEFT JOIN FootballTeamAlias ta ON ta.teamId=t.id
      UNION ALL
      SELECT 'competition' AS kind, l.id, l.name, l.country, ca.name AS alias
      FROM competitions e JOIN FootballCompetition l ON l.id=e.id
      LEFT JOIN FootballCompetitionAlias ca ON ca.competitionId=l.id
      LIMIT ${feedSearchRules.maximumCatalogRows + 1}`);
    if (rows.length > feedSearchRules.maximumCatalogRows) throw new MatchFeedError("unavailable");
    // Countries and canonical names recur across alias rows; score each distinct label once.
    const scores = new Map<string, number>();
    const score = (label: string | null) => {
      if (!label) return 0;
      let value = scores.get(label);
      if (value === undefined) {
        value = prepared.score(label);
        if (!Number.isInteger(value) || value < 0 || value > 1000) throw new MatchFeedError("unavailable");
        scores.set(label, value);
      }
      return value;
    };
    for (const row of rows) {
      if (row.kind !== "team" && row.kind !== "competition") throw new MatchFeedError("unavailable");
      const value = Math.max(score(row.name), score(row.country), score(row.alias));
      if (value === 0) continue;
      const matches = row.kind === "team" ? teams : competitions;
      matches.set(row.id, Math.max(matches.get(row.id) ?? 0, value));
      if (teams.size + competitions.size > feedSearchRules.maximumIdentities) throw new MatchFeedError("unavailable");
    }
  }
  const ranked = (matches: Map<string, number>) => Object.freeze([...matches]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, score]) => Object.freeze({ id, score })));
  return Object.freeze({ query: search, teams: ranked(teams), competitions: ranked(competitions) });
}
