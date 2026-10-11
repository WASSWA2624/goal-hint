import "server-only";

import { randomUUID } from "node:crypto";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { ApiFootballBounds } from "../football/api-football-contract.ts";
import { CatalogStoreError, type CatalogImportSummary } from "../football/catalog-mysql-store.ts";
import { teamCodeScopeKey, type MysqlTeamCodeStore, type TeamCodeCandidate, type TeamCodeCheck, type TeamCodeCursor } from "./team-code-mysql-store.ts";

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** A league whose /teams answer was stored is not requested again for this long, codes or not. */
export const TEAM_CODE_RECHECK_MS = 30 * DAY;
/** A failed /teams receipt (provider or quota trouble) backs its league off for this long. */
export const TEAM_CODE_FAILED_RECHECK_MS = DAY;
/** Fixtures that count: from just before now (live matches) to past the last imported EAT date. */
export const TEAM_CODE_WINDOW = Object.freeze({ beforeMs: 3 * HOUR, afterMs: 8 * DAY });
/** One competition-season's provider window; the request bounds end here even if the job has longer. */
export const TEAM_CODE_PROVIDER_WINDOW_MS = MINUTE;
/** A season starts only while this much of the attempt remains: its provider window plus a long catalog write. */
export const TEAM_CODE_SEASON_RESERVE_MS = 3 * MINUTE;
/** Candidates are read in pages of this size, nearest kickoff first, until a sweep has its due seasons. Leagues that stay
 * codeless after their check (youth, women's, small clubs) remain candidates, so one bounded read could otherwise
 * fill up with recently checked leagues and starve the unchecked ones behind them. */
export const TEAM_CODE_CANDIDATE_PAGE = 200;
/** At most this many pages per sweep (1,000 competition-seasons); further leagues wait for the window to move. */
export const TEAM_CODE_CANDIDATE_PAGES = 5;

/** Whether a competition-season is due for a /teams request at `now`, given its marker. */
export function teamCodeCheckDue(check: TeamCodeCheck | undefined, now: number): boolean {
  if (!check) return true;
  if (check.settledAt !== null && now - check.settledAt < TEAM_CODE_RECHECK_MS) return false;
  return check.failedAt === null || now - check.failedAt >= TEAM_CODE_FAILED_RECHECK_MS;
}
/** Nearest kickoff first, at most `limit`, skipping every competition-season checked recently. */
export function selectTeamCodeTargets(candidates: readonly TeamCodeCandidate[], checks: ReadonlyMap<string, TeamCodeCheck>,
  now: number, limit: number): readonly TeamCodeCandidate[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid team-code limit.");
  const ordered = [...candidates].sort((left, right) => left.firstKickoff - right.firstKickoff ||
    left.competitionId - right.competitionId || left.season - right.season);
  return Object.freeze(ordered.filter((candidate) => teamCodeCheckDue(checks.get(teamCodeScopeKey(candidate)), now)).slice(0, limit));
}

export type TeamCodeSeasonOutcome = Readonly<{ competitionId: number; season: number; teamsWithoutCode: number;
  status: CatalogImportSummary["status"]; requestsDispatched: number; importedTeams: number }>;
export type TeamCodeSweepSummary = Readonly<{
  /** Competition-seasons with codeless teams in the window that the selection read (paged and bounded), and those
   * selected for this sweep: not checked recently, nearest kickoff first, at most `maxSeasons`. */
  candidates: number; due: number;
  seasons: readonly TeamCodeSeasonOutcome[];
  /** Requests the stored receipts dispatched; an import that threw is counted as uncertain instead. */
  requestsDispatched: number; uncertain: boolean;
  /** Why the sweep ended before its last due season, if it did. */
  stopped: "failed-receipt" | "time" | "aborted" | "unavailable" | "refused" | null;
}>;
export type TeamCodeSweepRequest = Readonly<{ now: number; maxSeasons: number; remainingMs: () => number; signal?: AbortSignal }>;
type CatalogImporter = Readonly<{ import(input: unknown): Promise<CatalogImportSummary> }>;

/** Spare-quota team-code enrichment. It never writes codes itself: each due competition-season goes through the
 * ordinary catalog teams import (/teams?league&season), whose store keeps an existing code when the provider sends
 * none and bumps every fixture that renders a changed team. Its receipt is the "checked at" marker. */
export function createTeamCodeService(options: Readonly<{
  store: Pick<MysqlTeamCodeStore, "candidates" | "checks">;
  importer: CatalogImporter;
  retentionEvidenceRef: string;
  /** Request bounds at enrichment priority ending at `deadlineAt`; at most TEAM_CODES_REQUESTS_PER_SEASON dispatches. */
  bounds: (deadlineAt: UtcInstant) => ApiFootballBounds;
  clock?: () => number;
}>) {
  const clock = options.clock ?? Date.now;
  /** Pages through the candidates in kickoff order until `limit` due seasons are found, the candidates run out or the
   * page bound is reached. Pages are consecutive in that order, so the targets stay nearest kickoff first. */
  async function due(now: number, limit: number): Promise<Readonly<{ candidates: number; targets: readonly TeamCodeCandidate[] }>> {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid team-code limit.");
    const window = { from: now - TEAM_CODE_WINDOW.beforeMs, to: now + TEAM_CODE_WINDOW.afterMs };
    const targets: TeamCodeCandidate[] = [], seen = new Set<string>();
    let read = 0, after: TeamCodeCursor | null = null;
    for (let page = 0; page < TEAM_CODE_CANDIDATE_PAGES && targets.length < limit; page++) {
      const batch = await options.store.candidates(window, TEAM_CODE_CANDIDATE_PAGE, after);
      read += batch.length;
      if (batch.length === 0) break;
      // Pages are separate reads: a catalog write in between can move a season's earliest codeless kickoff past the
      // cursor, so it would come round again. Each /teams query is considered once per sweep.
      const unseen = batch.filter((entry) => !seen.has(`${entry.competitionId}:${entry.season}`));
      for (const entry of batch) seen.add(`${entry.competitionId}:${entry.season}`);
      const checks = await options.store.checks(unseen, now - TEAM_CODE_RECHECK_MS);
      targets.push(...selectTeamCodeTargets(unseen, checks, now, limit - targets.length));
      if (batch.length < TEAM_CODE_CANDIDATE_PAGE) break;
      const last = batch.at(-1)!;
      after = { firstKickoff: last.firstKickoff, competitionId: last.competitionId, season: last.season };
    }
    return Object.freeze({ candidates: read, targets: Object.freeze(targets) });
  }
  return Object.freeze({
    due,
    /** Imports up to `maxSeasons` due competition-seasons, nearest kickoff first, one at a time. Selection reads may
     * throw before any provider call; after the first call every failure is reported in the summary instead. */
    async sweep(request: TeamCodeSweepRequest): Promise<TeamCodeSweepSummary> {
      const { candidates, targets } = await due(request.now, request.maxSeasons);
      const seasons: TeamCodeSeasonOutcome[] = [];
      let requestsDispatched = 0, uncertain = false, stopped: TeamCodeSweepSummary["stopped"] = null;
      for (const target of targets) {
        if (request.signal?.aborted) { stopped = "aborted"; break; }
        if (request.remainingMs() < TEAM_CODE_SEASON_RESERVE_MS) { stopped = "time"; break; }
        const deadlineAt = utcInstantFromEpochMilliseconds(clock() + TEAM_CODE_PROVIDER_WINDOW_MS);
        let receipt: CatalogImportSummary;
        try {
          receipt = await options.importer.import({ id: randomUUID(), selection: { kind: "teams", query: { competitionId: target.competitionId,
            season: target.season } }, bounds: options.bounds(deadlineAt), retentionEvidenceRef: options.retentionEvidenceRef });
        } catch (error) {
          // The provider may have answered before storage failed, so the dispatch count is unknown.
          uncertain = true;
          stopped = error instanceof CatalogStoreError && (error.reason === "unavailable" || error.reason === "coordination-failed") ? "unavailable" : "refused";
          break;
        }
        requestsDispatched += receipt.requestsDispatched;
        seasons.push(Object.freeze({ competitionId: target.competitionId, season: target.season, teamsWithoutCode: target.teamsWithoutCode,
          status: receipt.status, requestsDispatched: receipt.requestsDispatched, importedTeams: receipt.importedCount }));
        // Provider or quota trouble: the failed receipt backs this league off, and the next slot tries again.
        if (receipt.status === "failed") { stopped = "failed-receipt"; break; }
      }
      return Object.freeze({ candidates, due: targets.length, seasons: Object.freeze(seasons), requestsDispatched, uncertain, stopped });
    },
  });
}
export type TeamCodeService = ReturnType<typeof createTeamCodeService>;
