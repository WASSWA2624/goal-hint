import "server-only";

import { parseReportingDate, type ReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import type { QuotaFeedback, QuotaPriority, QuotaDenialReason } from "./quota-contract.ts";

export const API_FOOTBALL_ORIGIN = "https://v3.football.api-sports.io";
export const API_FOOTBALL_CONTRACT_VERSION = "direct-v3-official-examples-2026-10-08";
export const apiFootballLeaderboards = Object.freeze({
  topScorers: Object.freeze({ path: "/players/topscorers", paginated: false, coverage: "top_scorers", group: "goals", metric: "total" }),
  topAssists: Object.freeze({ path: "/players/topassists", paginated: false, coverage: "top_assists", group: "goals", metric: "assists" }),
  topYellowCards: Object.freeze({ path: "/players/topyellowcards", paginated: false, coverage: "top_cards", group: "cards", metric: "yellow" }),
  topRedCards: Object.freeze({ path: "/players/topredcards", paginated: false, coverage: "top_cards", group: "cards", metric: "red" }),
} as const);
export type ApiFootballLeaderboard = keyof typeof apiFootballLeaderboards;
export const isApiFootballLeaderboard = (endpoint: string): endpoint is ApiFootballLeaderboard => Object.hasOwn(apiFootballLeaderboards, endpoint);

export const apiFootballEndpoints = Object.freeze({
  fixtures: Object.freeze({ path: "/fixtures", paginated: false }),
  fixtureRounds: Object.freeze({ path: "/fixtures/rounds", paginated: false }),
  countries: Object.freeze({ path: "/countries", paginated: false }),
  timezones: Object.freeze({ path: "/timezone", paginated: false }),
  leagueSeasons: Object.freeze({ path: "/leagues/seasons", paginated: false }),
  teams: Object.freeze({ path: "/teams", paginated: false }),
  teamSeasons: Object.freeze({ path: "/teams/seasons", paginated: false }),
  teamStatistics: Object.freeze({ path: "/teams/statistics", paginated: false }),
  venues: Object.freeze({ path: "/venues", paginated: false }),
  standings: Object.freeze({ path: "/standings", paginated: false }),
  transfers: Object.freeze({ path: "/transfers", paginated: false }),
  coaches: Object.freeze({ path: "/coachs", paginated: false }),
  squads: Object.freeze({ path: "/players/squads", paginated: false }),
  competitions: Object.freeze({ path: "/leagues", paginated: false }),
  statistics: Object.freeze({ path: "/fixtures/statistics", paginated: false }),
  fixtureHalfStatistics: Object.freeze({ path: "/fixtures/statistics", paginated: false }),
  events: Object.freeze({ path: "/fixtures/events", paginated: false }),
  lineups: Object.freeze({ path: "/fixtures/lineups", paginated: false }),
  injuries: Object.freeze({ path: "/injuries", paginated: false }),
  ...apiFootballLeaderboards,
  playerStatistics: Object.freeze({ path: "/players", paginated: true, pageSize: 20 }),
  playerProfiles: Object.freeze({ path: "/players/profiles", paginated: true, pageSize: 250 }),
  predictions: Object.freeze({ path: "/predictions", paginated: false }),
  accountStatus: Object.freeze({ path: "/status", paginated: false }),
  // Pre-match odds (prompt 052). The page size follows the official v3 documentation; the counted trial must confirm it.
  odds: Object.freeze({ path: "/odds", paginated: true, pageSize: 10 }),
  oddsBets: Object.freeze({ path: "/odds/bets", paginated: false }),
  oddsBookmakers: Object.freeze({ path: "/odds/bookmakers", paginated: false }),
  inPlayOdds: Object.freeze({ path: "/odds/live", paginated: false }),
  inPlayOddsBets: Object.freeze({ path: "/odds/live/bets", paginated: false }),
} as const);
export type ApiFootballEndpoint = keyof typeof apiFootballEndpoints;

export type FixtureRoundQuery = Readonly<{ competitionId: number; season: number }>;
export type ApiFootballFixtureRound = Readonly<Record<string, unknown> & { round: string; dates: readonly ReportingDate[] }>;

export function apiFootballFixtureRoundParameters({ competitionId, season }: FixtureRoundQuery): Readonly<Record<string, string>> {
  return { league: String(competitionId), season: String(season), dates: "true", timezone: "Africa/Kampala" };
}

export function parseApiFootballFixtureRound(raw: unknown): ApiFootballFixtureRound | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("round" in raw) || typeof raw.round !== "string" ||
    !raw.round.trim() || raw.round.length > 200 || raw.round.includes("\0") || !("dates" in raw) || !Array.isArray(raw.dates)) return null;
  try {
    return Object.freeze({ ...raw, round: raw.round, dates: Object.freeze(raw.dates.map(parseReportingDate)) });
  } catch { return null; }
}

export type FootballHistoryReferenceTarget = Readonly<
  { endpoint: "countries" | "timezones" | "leagueSeasons" }
  | { endpoint: "teams" | "standings" | "injuries" | "fixtureRounds" | ApiFootballLeaderboard; competitionId: number; season: number }
  | { endpoint: "teamStatistics"; competitionId: number; season: number; teamId: number }
  | { endpoint: "fixtureHalfStatistics"; fixtureId: number; homeTeamId: number; awayTeamId: number }
  | { endpoint: "venues"; venueId: number }
  | { endpoint: "transfers" | "coaches" | "squads" | "teamSeasons"; teamId: number }
>;

export function apiFootballReferenceParameters(target: FootballHistoryReferenceTarget): Readonly<Record<string, string>> | null {
  const providerId = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 4_294_967_295;
  const validSeason = (value: number) => Number.isInteger(value) && value >= 1000 && value <= 9999;
  if (!target || typeof target !== "object") return null;
  switch (target.endpoint) {
    case "countries":
    case "timezones":
    case "leagueSeasons": return Object.keys(target).length === 1 ? {} : null;
    case "venues": return providerId(target.venueId) ? { id: String(target.venueId) } : null;
    case "transfers":
    case "coaches":
    case "teamSeasons":
    case "squads": return providerId(target.teamId) ? { team: String(target.teamId) } : null;
    case "fixtureRounds":
      return providerId(target.competitionId) && validSeason(target.season) ? apiFootballFixtureRoundParameters(target) : null;
    case "fixtureHalfStatistics":
      return providerId(target.fixtureId) && providerId(target.homeTeamId) && providerId(target.awayTeamId) && target.homeTeamId !== target.awayTeamId
        ? { fixture: String(target.fixtureId), half: "true" } : null;
    case "teamStatistics":
      return providerId(target.competitionId) && validSeason(target.season) && providerId(target.teamId)
        ? { league: String(target.competitionId), season: String(target.season), team: String(target.teamId) } : null;
    case "teams":
    case "standings":
    case "injuries":
    case "topScorers":
    case "topAssists":
    case "topYellowCards":
    case "topRedCards":
      return providerId(target.competitionId) && validSeason(target.season)
        ? { league: String(target.competitionId), season: String(target.season) } : null;
    default: return null;
  }
}

/** Fixed rows per non-final page for paginated endpoints; null when no size is documented. */
export function pageSizeOf(endpoint: ApiFootballEndpoint): number | null {
  const entry = apiFootballEndpoints[endpoint];
  return "pageSize" in entry ? entry.pageSize : null;
}
/** Odds-specific semantics (bet catalog, labels, update times), stored in odds receipts and policy.
 * It is separate from API_FOOTBALL_CONTRACT_VERSION so fallback and evaluation cohorts are not split.
 * The date names the documented contract; the counted odds trial must confirm it before scheduling. */
export const ODDS_CONTRACT_VERSION = "direct-v3-odds-2026-10-10";

/** Explicit caller budgets; no default job allowance, retry budget or freshness policy. */
export type ApiFootballBounds = Readonly<{
  priority: QuotaPriority;
  deadlineAt: UtcInstant;
  timeoutMs: number;
  maxRequests: number;
  maxPages: number;
  maxRows: number;
  maxResponseBytes: number;
  retry: Readonly<{ maxAttempts: number; baseDelayMs: number; maxDelayMs: number }>;
  cacheMaxAgeMs: number;
  /** Required for predictions, so ready-made predictions remain within one fallback job. */
  cacheScope?: string;
}>;
/** Internal refresh guard; never serialized into provider parameters or cache data. */
export type ApiFootballFallbackWorkflow = Readonly<{
  signal: AbortSignal;
  deadlineAt: UtcInstant;
  check(): void;
  /** Checks remaining job allowance after a cache miss, without renewing or charging it. */
  beforeReserve?(): void;
  /** Counts against the owning job immediately before protected HTTP dispatch. */
  beforeDispatch?(): void;
}>;
export type ApiFootballErrorReason =
  | "invalid-request" | "invalid-credential" | "operation-not-authorized"
  | "authentication-error" | "subscription-expired" | "rate-limited"
  | "transport-error" | "response-body-error" | "coverage-error" | "schema-error"
  | "response-too-large" | "quota-denied" | "shared-work-pending"
  | "deadline-exceeded" | "request-budget-exhausted" | "pagination-incomplete";
export type ApiFootballFailure = Readonly<{
  reason: ApiFootballErrorReason;
  retryable: boolean;
  httpStatus?: number;
  retryAfterMs?: number;
  quotaReason?: QuotaDenialReason;
  retryAt?: UtcInstant;
}>;
export type ApiFootballPageProvenance = Readonly<{
  provider: "api-football";
  endpoint: ApiFootballEndpoint;
  requestParameters: Readonly<Record<string, string>>;
  contractVersion: typeof API_FOOTBALL_CONTRACT_VERSION;
  retrievedAt: UtcInstant;
  providerUpdatedAt: UtcInstant | null;
  fromCache: boolean;
  /** Null when no valid page metadata was returned, including documented /status omissions. */
  currentPage: number | null;
  totalPages: number | null;
  quota: QuotaFeedback;
}>;
export type ApiFootballResult<Data> = Readonly<{
  status: "complete" | "partial" | "failed";
  data: readonly Data[];
  completeness: Readonly<{
    complete: boolean;
    reasons: readonly string[];
    missingIds: readonly number[];
    missingCoverage: readonly string[];
    invalidRows: number;
  }>;
  provenance: readonly ApiFootballPageProvenance[];
  requestsDispatched: number;
  error: ApiFootballFailure | null;
}>;
export type ApiFootballCachePermission = Readonly<{
  endpoint: ApiFootballEndpoint;
  purpose: "structured-evidence" | "fallback-only";
  cacheScope: string | null;
  maxAgeMs: number;
  retrievedAt: UtcInstant;
  data: readonly unknown[];
}>;

/** Batch support must be confirmed by a trusted verifier, not a reference alone. */
export type ApiFootballBatchEvidence = Readonly<{
  maximumIds: number;
  evidenceRef: string;
}>;
