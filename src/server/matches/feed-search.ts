import "server-only";

import type { ReportingDateRange } from "../../domain/calendar.ts";
import { prepareFootballSearch, type FootballSearchMatch } from "../../domain/football-search.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "./feed-error.ts";
import { publicFixtureCohortScope } from "./feed-read.ts";

export const feedSearchRules = Object.freeze({ maximumCatalogRows: 50_000, maximumIdentities: 10_000, maximumWords: 16 });
/** `covered` and `direct` hold the query words this identity's names match (directly: exactly, by alias or prefix);
 * `anchor` holds those matched by a team or competition name or alias rather than by its country. */
export type RankedFeedIdentity = Readonly<{ id: string; score: number; covered: number; direct: number; anchor: number }>;
export type FeedSearch = Readonly<{
  query: string;
  /** Number of query words; bit i of every mask stands for word i. */
  words: number;
  /** Words that identify something on their own (PreparedFootballSearch.distinctive), plus ambiguous words that a catalog
   * name in this date cohort contains exactly. */
  distinctive: number;
  teams: readonly RankedFeedIdentity[];
  competitions: readonly RankedFeedIdentity[];
}>;
type CatalogRow = { kind: "team" | "competition"; id: string; name: string | null; country: string | null; alias: string | null };
type Identity = { score: number; covered: number; direct: number; anchor: number };

/** Resolve catalog identities before SQL pagination; fixture rows never enter the fuzzy matcher.
 * Alias joins follow deduplicated entities, so home/away aliases cannot multiply each other.
 * Partial mentions are kept with the words they cover: a fixture may combine "Barcelona" (home) and "Real Madrid"
 * (away) into a full match of "Barcelona vs Real Madrid", which feedSql decides per fixture.
 * Explicit bounds fail closed rather than returning a truncated search cohort on a shared host. */
export async function storedFeedSearch(tx: Prisma.TransactionClient, search: string, range: ReportingDateRange,
  competitionIds: readonly number[], locale?: string): Promise<FeedSearch | null> {
  if (!search) return null;
  const prepared = prepareFootballSearch(search, locale);
  const words = prepared.tokens.length, full = 2 ** Math.min(words, feedSearchRules.maximumWords) - 1;
  const teams = new Map<string, Identity>(), competitions = new Map<string, Identity>();
  // Query words that resemble a generic word count as distinctive once a catalog name contains them ("Reading").
  let named = 0;
  if (words > 0 && words <= feedSearchRules.maximumWords) {
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
    // Countries and canonical names recur across alias rows; match each distinct label once.
    const labels = new Map<string, FootballSearchMatch | null>();
    const match = (label: string | null) => {
      if (!label) return null;
      let found = labels.get(label);
      if (found === undefined) {
        found = prepared.match(label);
        if (found && (!Number.isInteger(found.score) || found.score < 1 || found.score > 1000 ||
          [found.covered, found.direct, found.named].some((mask) => !Number.isInteger(mask) || mask < 0 || mask > full) ||
          found.covered === 0 || (found.direct & ~found.covered) !== 0 || (found.named & ~found.covered) !== 0)) throw new MatchFeedError("unavailable");
        if (found) named |= found.named;
        labels.set(label, found);
      }
      return found;
    };
    for (const row of rows) {
      if (row.kind !== "team" && row.kind !== "competition") throw new MatchFeedError("unavailable");
      const found = [[match(row.name), true], [match(row.alias), true], [match(row.country), false]] as const;
      if (!found.some(([label]) => label)) continue;
      const matches = row.kind === "team" ? teams : competitions;
      const identity = matches.get(row.id) ?? { score: 0, covered: 0, direct: 0, anchor: 0 };
      for (const [label, named] of found) {
        if (!label) continue;
        identity.score = Math.max(identity.score, label.score);
        identity.covered |= label.covered;
        identity.direct |= label.direct;
        if (named) identity.anchor |= label.covered;
      }
      matches.set(row.id, identity);
      if (teams.size + competitions.size > feedSearchRules.maximumIdentities) throw new MatchFeedError("unavailable");
    }
  }
  const ranked = (matches: Map<string, Identity>) => Object.freeze([...matches]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, identity]) => Object.freeze({ id, ...identity })));
  return Object.freeze({ query: search, words, distinctive: prepared.distinctive | prepared.ambiguous & named,
    teams: ranked(teams), competitions: ranked(competitions) });
}
