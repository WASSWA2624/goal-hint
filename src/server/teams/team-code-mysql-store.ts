import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { catalogScopeKey } from "../football/catalog-input.ts";

const PROVIDER = "api-football";
/** Upper bounds that keep one selection read small whatever the catalog holds. */
const MAX_CANDIDATES = 500, MAX_RECEIPTS = 5_000;

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

/** The catalog scope of the teams import for one competition-season; its receipts carry the same key. */
export function teamCodeScopeKey(target: TeamCodeTargetKey): string {
  return catalogScopeKey({ kind: "teams", query: { competitionId: target.competitionId, season: target.season } });
}
const bounded = (value: number, maximum: number) => Number.isSafeInteger(value) && value >= 1 && value <= maximum;
const instant = (value: unknown) => {
  if (!Number.isSafeInteger(value)) throw new RangeError("Invalid team-code window.");
  return utcInstantFromEpochMilliseconds(value as number);
};

/** Read-only selection inputs for the team-code import. No migration: the catalog's own append-only teams receipts
 * (`FootballImport`, kind `teams`, indexed by scope key and observation time) are the per-competition-season markers. */
export function createMysqlTeamCodeStore(database: DatabaseRuntime) {
  return Object.freeze({
    /** Nearest-kickoff first. Only fixtures inside [from, to) count, and only their codeless teams. */
    async candidates(window: Readonly<{ from: number; to: number }>, limit: number): Promise<readonly TeamCodeCandidate[]> {
      const from = instant(window.from), to = instant(window.to);
      if (from >= to || !bounded(limit, MAX_CANDIDATES)) throw new RangeError("Invalid team-code candidate bounds.");
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
        GROUP BY s.id, cp.externalId, s.year
        ORDER BY firstKickoff ASC, competitionId ASC, season ASC
        LIMIT ${limit}`);
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
      const rows = await database.query((client) => client.footballImport.findMany({ where: { kind: "teams", scopeKey: { in: keys },
        observedAt: { gte: new Date(after) } }, select: { scopeKey: true, status: true, observedAt: true },
        orderBy: [{ observedAt: "desc" }, { sequence: "desc" }], take: MAX_RECEIPTS }));
      const checks = new Map<string, { settledAt: UtcInstant | null; failedAt: UtcInstant | null }>();
      for (const row of rows) {
        const entry = checks.get(row.scopeKey) ?? { settledAt: null, failedAt: null }, at = utcInstantFromEpochMilliseconds(row.observedAt.getTime());
        // Rows arrive newest first, so the first of each kind is its latest.
        if (row.status === "failed") entry.failedAt ??= at; else entry.settledAt ??= at;
        checks.set(row.scopeKey, entry);
      }
      return new Map([...checks].map(([key, value]) => [key, Object.freeze(value)]));
    },
  });
}
export type MysqlTeamCodeStore = ReturnType<typeof createMysqlTeamCodeStore>;
