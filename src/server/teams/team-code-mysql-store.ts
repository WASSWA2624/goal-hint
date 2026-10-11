import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { catalogScopeKey } from "../football/catalog-input.ts";

const PROVIDER = "api-football";
/** Upper bound that keeps one selection read small whatever the catalog holds (candidates per page, targets per check). */
const MAX_CANDIDATES = 500;

/** A competition-season with a fixture inside the window whose home or away team has no stored code. */
export type TeamCodeCandidate = Readonly<{
  seasonId: string;
  /** API-Football league id and season year: the /teams?league&season query. */
  competitionId: number;
  season: number;
  /** Earliest kickoff, inside the window, of the season's fixtures with a codeless team. */
  firstKickoff: UtcInstant;
  /** Distinct codeless teams among those fixtures. */
  teamsWithoutCode: number;
}>;
/** The "checked at" marker of one competition-season: its latest /teams receipts. A receipt that observed the league
 * (complete, partial or degraded) settles it; a failed receipt only backs it off. */
export type TeamCodeCheck = Readonly<{ settledAt: UtcInstant | null; failedAt: UtcInstant | null }>;
export type TeamCodeTargetKey = Pick<TeamCodeCandidate, "competitionId" | "season">;
/** Keyset position in the candidate order (earliest kickoff, league id, season): the next page starts after it. */
export type TeamCodeCursor = Pick<TeamCodeCandidate, "firstKickoff" | "competitionId" | "season">;

/** The catalog scope of the teams import for one competition-season; its receipts carry the same key. */
export function teamCodeScopeKey(target: TeamCodeTargetKey): string {
  return catalogScopeKey({ kind: "teams", query: { competitionId: target.competitionId, season: target.season } });
}
const bounded = (value: number, maximum: number) => Number.isSafeInteger(value) && value >= 1 && value <= maximum;
const instant = (value: unknown) => {
  if (!Number.isSafeInteger(value)) throw new RangeError("Invalid team-code window.");
  return utcInstantFromEpochMilliseconds(value as number);
};
/** The first page starts just before the window, which sorts before every candidate in it. */
function cursorAfter(from: number, after: TeamCodeCursor | null | undefined): Readonly<{ kickoff: Date; competitionId: bigint; season: number }> {
  if (after === null || after === undefined) return { kickoff: new Date(from - 1), competitionId: 0n, season: 0 };
  if (!Number.isSafeInteger(after.firstKickoff) || !bounded(after.competitionId, Number.MAX_SAFE_INTEGER) || !bounded(after.season, 9999)) {
    throw new RangeError("Invalid team-code cursor.");
  }
  return { kickoff: new Date(after.firstKickoff), competitionId: BigInt(after.competitionId), season: after.season };
}

/** Read-only selection inputs for the team-code import. No migration: the catalog's own append-only teams receipts
 * (`FootballImport`, kind `teams`, indexed by scope key and observation time) are the per-competition-season markers. */
export function createMysqlTeamCodeStore(database: DatabaseRuntime) {
  return Object.freeze({
    /** Nearest-kickoff first. Only fixtures inside [from, to) count, and only their codeless teams. `after` pages through
     * the same order (keyset), so leagues checked recently cannot crowd unchecked ones out of a bounded read. */
    async candidates(window: Readonly<{ from: number; to: number }>, limit: number, after: TeamCodeCursor | null = null): Promise<readonly TeamCodeCandidate[]> {
      const from = instant(window.from), to = instant(window.to);
      if (from >= to || !bounded(limit, MAX_CANDIDATES)) throw new RangeError("Invalid team-code candidate bounds.");
      const cursor = cursorAfter(from, after);
      const rows = await database.query((client) => client.$queryRaw<{ seasonId: string; competitionId: bigint | number; season: number;
        firstKickoff: Date; teamsWithoutCode: bigint | number }[]>`
        SELECT s.id AS seasonId, cp.externalId AS competitionId, s.year AS season, MIN(t.kickoff) AS firstKickoff,
          COUNT(DISTINCT t.teamId) AS teamsWithoutCode
        FROM (
          SELECT f.seasonId, f.kickoff, f.homeTeamId AS teamId FROM FootballFixture f JOIN FootballTeam h ON h.id = f.homeTeamId
            WHERE f.kickoff >= ${new Date(from)} AND f.kickoff < ${new Date(to)} AND h.code IS NULL
          UNION ALL
          SELECT f.seasonId, f.kickoff, f.awayTeamId AS teamId FROM FootballFixture f JOIN FootballTeam a ON a.id = f.awayTeamId
            WHERE f.kickoff >= ${new Date(from)} AND f.kickoff < ${new Date(to)} AND a.code IS NULL
        ) t
        JOIN FootballSeason s ON s.id = t.seasonId
        JOIN FootballCompetitionProvider cp ON cp.competitionId = s.competitionId AND cp.provider = ${PROVIDER}
        WHERE cp.externalId BETWEEN 1 AND ${BigInt(Number.MAX_SAFE_INTEGER)} AND s.year BETWEEN 1 AND 9999
        GROUP BY s.id, cp.externalId, s.year
        HAVING MIN(t.kickoff) > ${cursor.kickoff} OR (MIN(t.kickoff) = ${cursor.kickoff} AND (cp.externalId > ${cursor.competitionId}
          OR (cp.externalId = ${cursor.competitionId} AND s.year > ${cursor.season})))
        ORDER BY firstKickoff ASC, competitionId ASC, season ASC
        LIMIT ${limit}`);
      // The WHERE bounds keep unusable identities out before LIMIT, so a short page always means the candidates ran out;
      // this filter only re-asserts them.
      return Object.freeze(rows.map((row) => Object.freeze({ seasonId: row.seasonId, competitionId: Number(row.competitionId), season: Number(row.season),
        firstKickoff: utcInstantFromEpochMilliseconds(row.firstKickoff.getTime()), teamsWithoutCode: Number(row.teamsWithoutCode) }))
        .filter((row) => Number.isSafeInteger(row.competitionId) && row.competitionId > 0 && Number.isSafeInteger(row.season) &&
          row.season >= 1 && row.season <= 9999));
    },
    /** Markers for each target, from teams receipts observed at or after `since`, keyed by `teamCodeScopeKey`. */
    async checks(targets: readonly TeamCodeTargetKey[], since: number): Promise<ReadonlyMap<string, TeamCodeCheck>> {
      const after = instant(since);
      if (targets.length > MAX_CANDIDATES) throw new RangeError("Too many team-code targets.");
      const keys = [...new Set(targets.map(teamCodeScopeKey))];
      if (keys.length === 0) return new Map();
      // The latest receipt per league and status (at most a few rows per target), so every marker is exact. A row cap over
      // the raw receipts instead could let other leagues' daily failed retries push a league's only settled receipt out of
      // the read, and that league would be requested again inside its 30 days.
      const rows = await database.query((client) => client.footballImport.groupBy({ by: ["scopeKey", "status"],
        where: { kind: "teams", scopeKey: { in: keys }, observedAt: { gte: new Date(after) } }, _max: { observedAt: true } }));
      const checks = new Map<string, { settledAt: UtcInstant | null; failedAt: UtcInstant | null }>();
      const later = (current: UtcInstant | null, at: UtcInstant) => current !== null && current >= at ? current : at;
      for (const row of rows) {
        if (row._max.observedAt === null) continue;
        const entry = checks.get(row.scopeKey) ?? { settledAt: null, failedAt: null }, at = utcInstantFromEpochMilliseconds(row._max.observedAt.getTime());
        // Any observed outcome (complete, partial, degraded) settles the league; a failed one only backs it off.
        if (row.status === "failed") entry.failedAt = later(entry.failedAt, at); else entry.settledAt = later(entry.settledAt, at);
        checks.set(row.scopeKey, entry);
      }
      return new Map([...checks].map(([key, value]) => [key, Object.freeze(value)]));
    },
  });
}
export type MysqlTeamCodeStore = ReturnType<typeof createMysqlTeamCodeStore>;
