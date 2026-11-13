import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { assertOperationAllowed, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { API_FOOTBALL_ORIGIN, API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints, apiFootballFixtureRoundParameters,
  apiFootballLeaderboards, apiFootballReferenceParameters, isApiFootballLeaderboard, isFootballHistoryReferenceDictionary,
  pageSizeOf, parseApiFootballFixtureRound,
  type ApiFootballBounds, type ApiFootballEndpoint, type ApiFootballFailure,
  type ApiFootballPageProvenance, type ApiFootballResult, type ApiFootballCachePermission,
  type ApiFootballBatchEvidence, type ApiFootballFallbackWorkflow, type FixtureRoundQuery, type FootballHistoryReferenceTarget } from "./api-football-contract.ts";
import { normalizeFixture, normalizeTeam, normalizeCompetition, normalizeStatistics, normalizeEvent,
  normalizeAvailability, normalizePlayerStatistics, normalizeFallbackPrediction,
  normalizeAccountStatus, normalizeOdds, normalizeOddsCatalogEntry, normalizeInPlayOdds,
  type NormalizationContext, type NormalizationResult, type NormalizedFixture, type NormalizedFixtureOdds } from "./api-football-normalize.ts";
import { createPolicyQuotaGateway, type createQuotaGateway, type GatewayQuotaLimiter } from "./quota-gateway.ts";
import { quotaPriorities, type QuotaFeedback } from "./quota-contract.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { createDemoApiFootballFetch } from "../demo/api-football.ts";
import { authorizeDemoFootball, createDemoFootballGateway, demoFootballAccountId } from "../demo/provider-runtime.ts";
import { normalizeFixtureMatchDetails, type NormalizedFixtureMatchDetails } from "./fixture-match-details.ts";
import { normalizeFootballHistoryOddsMapping } from "./history-odds-mapping.ts";
import { isFootballHistoryPersonRecord, isFootballHistoryPersonRecordEndpoint, readFootballHistoryPersonGroup } from "./history-person-records.ts";
import { archivedCoachRowId, archivedPlayerProfileRowId, archivedPlayerStatisticsRowId, playerStatisticsProviderId } from "./history-player-statistics-input.ts";
import type { FootballHistoryPlayerProfileSelector, FootballHistoryPlayerStatisticsSelector } from "./history-player-statistics.ts";

export type FixtureQuery = Readonly<{ date?: string; competitionId?: number; season?: number;
  teamId?: number; from?: string; to?: string; round?: string; fixtureId?: number; fixtureIds?: readonly number[] }>;
export type TeamQuery = Readonly<{ teamId: number }> | Readonly<{ competitionId: number; season: number }>;
export type CompetitionQuery = Readonly<{ competitionId?: number; season?: number }>;
export type PlayerStatisticsQuery = Readonly<{ competitionId: number; season: number; teamId?: number }>;
export type OddsQuery = Readonly<{ date: string; bookmakerId: number }> | Readonly<{ fixtureId: number; bookmakerId: number }>;
/** Only a Kampala date sweep can request every bookmaker. */
export type OddsSweepQuery = OddsQuery | Readonly<{ date: string; allBookmakers: true }>;
export type ApiFootballAdapterOptions = Readonly<{
  accountId: string;
  credential: Readonly<{ read(): string }>;
  gateway: Pick<ReturnType<typeof createQuotaGateway>, "execute"> & Partial<Pick<ReturnType<typeof createQuotaGateway>, "abandon">>;
  authorize: () => void;
  fetcher?: typeof fetch;
  clock?: Clock;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  verifyCacheUse?: (permission: ApiFootballCachePermission) => boolean;
  batchEvidence?: ApiFootballBatchEvidence;
  verifyBatchEvidence?: (evidence: ApiFootballBatchEvidence) => boolean;
  verifyLogo?: NormalizationContext["verifyLogo"];
  verifyRegulationScore?: NormalizationContext["verifyRegulationScore"];
  verifyHalfTimeScore?: NormalizationContext["verifyHalfTimeScore"];
  /** Private snapshot capture of a validated fixture page, including embedded match details. */
  observeFixturePage?: (rows: readonly unknown[], provenance: ApiFootballPageProvenance) => void | Promise<void>;
  /** Preserve rows from a valid envelope even when a canonical projection rejects some fields. */
  retainPartiallyNormalizedFixturePages?: true;
  /** Private archive capture of a competition catalog envelope, including coverage fields. */
  observeCompetitionPage?: (rows: readonly unknown[], provenance: ApiFootballPageProvenance) => Promise<void>;
  cacheCapacity?: number;
}>;
type Params = Readonly<Record<string, string>>;
type Normalize<T> = (raw: unknown, context: NormalizationContext) => NormalizationResult<T>;
type Page<T> = Readonly<{ cacheKey: string; data: readonly T[]; provenance: ApiFootballPageProvenance;
  missingCoverage: readonly string[]; invalidRows: number; error: ApiFootballFailure | null }>;
type Budget = { requests: number };
type PageOutcome<T> = Readonly<{ page?: Page<T>; error?: ApiFootballFailure; provenance?: readonly ApiFootballPageProvenance[] }>;
const failure = (reason: ApiFootballFailure["reason"], retryable = false): ApiFootballFailure => ({ reason, retryable });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const keysAllowed = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => record(value) && Object.keys(value).every((key) => keys.includes(key));

type ReferenceRow = Readonly<{ raw: Readonly<Record<string, unknown>> | string | number; id?: number }>;

function archivePlayerRow(raw: unknown, id: number | null): NormalizationResult<ReferenceRow> {
  return id === null || !record(raw) ? { valid: false, reason: "schema-error" } :
    { valid: true, data: { raw, id }, missingCoverage: [] };
}

function statisticsSeries(series: unknown): boolean {
  return Array.isArray(series) && series.every((entry) => record(entry) && typeof entry.type === "string" &&
    entry.type.trim().length > 0 && entry.type.length <= 128 && (entry.value === null ||
      typeof entry.value === "number" && Number.isFinite(entry.value) || typeof entry.value === "string" && entry.value.length <= 128));
}

function normalizeReferenceRow(raw: unknown, target: FootballHistoryReferenceTarget): NormalizationResult<ReferenceRow> {
  const invalid = { valid: false, reason: "schema-error" } as const;
  const identified = (value: unknown): value is Record<string, unknown> & { id: number } =>
    record(value) && positive(value.id) && value.id <= 4_294_967_295;
  const valid = (raw: ReferenceRow["raw"], id?: number): NormalizationResult<ReferenceRow> => ({ valid: true,
    data: Object.freeze({ raw, ...(id === undefined ? {} : { id }) }), missingCoverage: [] });
  if (target.endpoint === "timezones") return typeof raw === "string" && raw.length <= 128 &&
    /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/u.test(raw) ? valid(raw) : invalid;
  if (target.endpoint === "leagueSeasons" || target.endpoint === "playerSeasons" || target.endpoint === "playerSeasonHistory" ||
      target.endpoint === "teamSeasons") {
    return positive(raw) && raw >= 1000 && raw <= 9999 ? valid(raw, raw) : invalid;
  }
  if (!record(raw)) return invalid;

  switch (target.endpoint) {
    case "countries":
    case "teamCountries":
      return typeof raw.name === "string" && raw.name.trim().length > 0 && raw.name.length <= 256 && !raw.name.includes("\0") &&
        (raw.code === null || typeof raw.code === "string" && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(raw.code) && raw.code.length <= 32) &&
        (raw.flag === null || typeof raw.flag === "string" && raw.flag.length <= 2048) ? valid(raw) : invalid;
    case "teams":
    case "teamsByCountry":
      if (!identified(raw.team) || (target.endpoint === "teamsByCountry" && raw.team.country !== target.country) ||
        (raw.venue != null && (!record(raw.venue) || raw.venue.id != null && !identified(raw.venue)))) return invalid;
      return valid(raw, raw.team.id);
    case "teamStatistics":
      return record(raw.league) && raw.league.id === target.competitionId && raw.league.season === target.season &&
        record(raw.team) && raw.team.id === target.teamId && record(raw.fixtures) && record(raw.goals) ? valid(raw, target.teamId) : invalid;
    case "fixtureRounds": {
      const round = parseApiFootballFixtureRound(raw);
      return round ? valid(round) : invalid;
    }
    case "fixtureHalfStatistics":
      return identified(raw.team) && [target.homeTeamId, target.awayTeamId].includes(raw.team.id) &&
        statisticsSeries(raw.statistics) && [raw.statistics_1h, raw.statistics_2h].every((series) => series == null || statisticsSeries(series))
        ? valid(raw, raw.team.id) : invalid;
    case "topScorers":
    case "topAssists":
    case "topYellowCards":
    case "topRedCards": {
      if (!identified(raw.player) || !Array.isArray(raw.statistics) || !raw.statistics.length) return invalid;
      const { group, metric } = apiFootballLeaderboards[target.endpoint];
      const allInScope = raw.statistics.every((statistic) => {
        if (!record(statistic) || !record(statistic.league) || statistic.league.id !== target.competitionId ||
          statistic.league.season !== target.season || !identified(statistic.team)) return false;
        const counts = statistic[group];
        return record(counts) && (counts[metric] === null || nonnegative(counts[metric]));
      });
      return allInScope ? valid(raw, raw.player.id) : invalid;
    }
    case "venues":
      return raw.id === target.venueId ? valid(raw, target.venueId) : invalid;
    case "venuesByCountry":
      return identified(raw) && raw.country === target.country ? valid(raw, raw.id) : invalid;
    case "trophies":
    case "sidelined": {
      if (target.subjectIds.length === 1) return isFootballHistoryPersonRecord(target.endpoint, raw) ? valid(raw) : invalid;
      const group = readFootballHistoryPersonGroup(target.endpoint, raw, target.subjectIds);
      return group ? valid(raw, group.subjectId) : invalid;
    }
    case "standings":
      if (!record(raw.league) || raw.league.id !== target.competitionId || raw.league.season !== target.season ||
        !Array.isArray(raw.league.standings) || !raw.league.standings.every((group) => Array.isArray(group) &&
          group.every((entry) => record(entry) && positive(entry.rank) && identified(entry.team)))) return invalid;
      return valid(raw, target.competitionId);
    case "injuries":
      // A player can appear in multiple fixtures, so the player id is not a row identity.
      return record(raw.league) && raw.league.id === target.competitionId && raw.league.season === target.season &&
        identified(raw.fixture) && identified(raw.player) && identified(raw.team) ? valid(raw) : invalid;
    case "coaches": {
      const id = archivedCoachRowId(raw, target.teamId);
      return id === null ? invalid : valid(raw, id);
    }
    case "coachProfiles":
      return archivedCoachRowId(raw) === target.coachId ? valid(raw, target.coachId) : invalid;
    case "squads":
      return record(raw.team) && raw.team.id === target.teamId && Array.isArray(raw.players) && raw.players.every(identified) &&
        new Set(raw.players.map(({ id }) => id)).size === raw.players.length ? valid(raw, target.teamId) : invalid;
    case "playerTeams":
      return identified(raw.team) && Array.isArray(raw.seasons) && raw.seasons.length > 0 &&
        raw.seasons.every((season) => positive(season) && season >= 1000 && season <= 9999) &&
        new Set(raw.seasons).size === raw.seasons.length ? valid(raw, raw.team.id) : invalid;
    case "transfers":
    case "playerTransfers": {
      if (!identified(raw.player) || !Array.isArray(raw.transfers)) return invalid;
      if (target.endpoint === "playerTransfers" && raw.player.id !== target.playerId) return invalid;
      let matches = target.endpoint === "playerTransfers";
      for (const transfer of raw.transfers) {
        if (!record(transfer) || !record(transfer.teams) || typeof transfer.date !== "string") return invalid;
        try { parseReportingDate(transfer.date); } catch { return invalid; }
        for (const club of [transfer.teams.in, transfer.teams.out]) {
          if (club === null || record(club) && club.id === null) continue;
          if (!identified(club)) return invalid;
          if (target.endpoint === "transfers" && club.id === target.teamId) matches = true;
        }
      }
      // A team lookup can include off-team rows. It only proves the team's request scope.
      return matches ? valid(raw, raw.player.id) : invalid;
    }
  }
}

function validBounds(bounds: ApiFootballBounds, now: UtcInstant, fallback: boolean): boolean {
  if (!record(bounds) || !record(bounds.retry)) return false;
  return Object.hasOwn(quotaPriorities, bounds.priority) && Number.isSafeInteger(bounds.deadlineAt)
    && bounds.deadlineAt > now && positive(bounds.timeoutMs) && bounds.timeoutMs <= 2_147_483_647
    && [bounds.maxRequests, bounds.maxPages, bounds.maxRows, bounds.maxResponseBytes, bounds.retry.maxAttempts].every(positive)
    && nonnegative(bounds.retry.baseDelayMs) && nonnegative(bounds.retry.maxDelayMs)
    && bounds.retry.baseDelayMs <= bounds.retry.maxDelayMs && bounds.retry.maxDelayMs <= 2_147_483_647
    && nonnegative(bounds.cacheMaxAgeMs)
    && (!fallback || (typeof bounds.cacheScope === "string" && bounds.cacheScope.trim().length > 0 && bounds.cacheScope.length <= 256));
}
function queryParams(query: FixtureQuery): Params | null {
  if (!keysAllowed(query, ["date", "competitionId", "season", "teamId", "from", "to", "round", "fixtureId"]) || Object.keys(query).length === 0) return null;
  if ([query.competitionId, query.teamId, query.fixtureId].some((id) => id !== undefined && !positive(id))) return null;
  if (query.season !== undefined && (!positive(query.season) || query.season > 9999)) return null;
  if (query.competitionId !== undefined && query.season === undefined) return null;
  if (query.season !== undefined && query.competitionId === undefined && query.teamId === undefined) return null;
  if ((query.from === undefined) !== (query.to === undefined)) return null;
  if (query.date !== undefined && query.from !== undefined) return null;
  if (query.round !== undefined && (typeof query.round !== "string" || query.round.length < 1 || query.round.length > 200 || query.competitionId === undefined)) return null;
  if (query.fixtureId !== undefined && Object.keys(query).length !== 1) return null;
  const params: Record<string, string> = { timezone: "Africa/Kampala" };
  try {
    if (query.date !== undefined) params.date = parseReportingDate(query.date);
    if (query.from !== undefined && query.to !== undefined) {
      params.from = parseReportingDate(query.from); params.to = parseReportingDate(query.to);
      if (params.from > params.to) return null;
    }
  } catch { return null; }
  for (const [field, parameter] of [["competitionId", "league"], ["teamId", "team"], ["fixtureId", "id"], ["season", "season"], ["round", "round"]] as const) {
    if (query[field] !== undefined) params[parameter] = String(query[field]);
  }
  return Object.keys(params).length > 1 ? params : null;
}
/** A null result fails before any reservation. */
function oddsParams(query: OddsSweepQuery): Params | null {
  if (!record(query)) return null;
  if ("allBookmakers" in query) {
    if (query.allBookmakers !== true || !keysAllowed(query, ["date", "allBookmakers"]) || typeof query.date !== "string") return null;
    try { return { date: parseReportingDate(query.date), timezone: "Africa/Kampala" }; } catch { return null; }
  }
  if (!positive(query.bookmakerId)) return null;
  const params: Record<string, string> = { bookmaker: String(query.bookmakerId), timezone: "Africa/Kampala" };
  if (keysAllowed(query, ["fixtureId", "bookmakerId"]) && "fixtureId" in query) {
    if (!positive(query.fixtureId)) return null;
    params.fixture = String(query.fixtureId);
    return params;
  }
  if (!keysAllowed(query, ["date", "bookmakerId"]) || !("date" in query) || typeof query.date !== "string") return null;
  try { params.date = parseReportingDate(query.date); } catch { return null; }
  return params;
}
class BodyFailure extends Error {
  readonly reason: "response-body-error" | "response-too-large";
  constructor(reason: "response-body-error" | "response-too-large") { super(reason); this.reason = reason; }
}
function matchesScope(endpoint: ApiFootballEndpoint, params: Params, row: unknown): boolean {
  if (!record(row)) return false;
  if (endpoint === "fixtures") {
    const fixture = row as unknown as NormalizedFixture;
    if (params.id && fixture.id !== Number(params.id)) return false;
    if (params.ids && !params.ids.split("-").map(Number).includes(fixture.id)) return false;
    if (params.league && fixture.competition.id !== Number(params.league)) return false;
    if (params.season && fixture.competition.season !== Number(params.season)) return false;
    if (params.team && ![fixture.homeTeam.id, fixture.awayTeam.id].includes(Number(params.team))) return false;
    if (params.round && fixture.competition.round !== params.round) return false;
    if (params.date || params.from) {
      if (fixture.kickoff === null) return false;
      const date = getReportingDate(fixture.kickoff);
      if (params.date && date !== params.date || params.from && (date < params.from || date > params.to!)) return false;
    }
  }
  if ((endpoint === "teams" || endpoint === "competitions") && params.id && row.id !== Number(params.id)) return false;
  if (endpoint === "competitions" && params.season && Array.isArray(row.seasons)
    && !row.seasons.some((season) => record(season) && season.year === Number(params.season))) return false;
  if (endpoint === "playerStatistics" && Array.isArray(row.statistics)
    && !row.statistics.some((statistic) => record(statistic) && record(statistic.competition)
      && statistic.competition.id === Number(params.league) && statistic.competition.season === Number(params.season)
      && (params.team === undefined || record(statistic.team) && statistic.team.id === Number(params.team)))) return false;
  if (endpoint === "injuries" && params.fixture && row.fixtureId !== null && row.fixtureId !== Number(params.fixture)) return false;
  if (endpoint === "odds") {
    const odds = row as unknown as NormalizedFixtureOdds;
    if (params.fixture && odds.fixtureId !== Number(params.fixture)) return false;
    // A null kickoff cannot be placed on the requested Kampala date.
    if (params.date && (odds.kickoff === null || getReportingDate(odds.kickoff) !== params.date)) return false;
    if (params.bookmaker && !odds.bookmakers.every((bookmaker) => bookmaker.id === Number(params.bookmaker))) return false;
  }
  return true;
}
async function readBody(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (contentType !== "application/json" && !contentType?.endsWith("+json")) {
    await response.body?.cancel(); throw new BodyFailure("response-body-error");
  }
  if (length && /^\d+$/u.test(length) && Number(length) > limit) {
    await response.body?.cancel(); throw new BodyFailure("response-too-large");
  }
  if (!response.body) throw new BodyFailure("response-body-error");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (signal.aborted) await reader.cancel();
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read(); signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new BodyFailure("response-too-large"); }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { throw new BodyFailure("response-body-error"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
function quotaHeaders(response: Response, now: UtcInstant): Omit<QuotaFeedback, "kind"> {
  const observation: { dailyLimit?: number; dailyRemaining?: number; minuteLimit?: number; minuteRemaining?: number; retryAfterMs?: number } = {};
  for (const [header, field] of [["x-ratelimit-requests-limit", "dailyLimit"], ["x-ratelimit-requests-remaining", "dailyRemaining"],
    ["x-ratelimit-limit", "minuteLimit"], ["x-ratelimit-remaining", "minuteRemaining"]] as const) {
    const value = response.headers.get(header);
    if (value !== null && /^\d+$/u.test(value) && nonnegative(Number(value))) observation[field] = Number(value);
  }
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const delay = /^\d+(?:\.\d+)?$/u.test(retryAfter) ? Math.ceil(Number(retryAfter) * 1000)
      : /GMT$/u.test(retryAfter) ? Math.max(0, Date.parse(retryAfter) - now) : NaN;
    if (nonnegative(delay)) observation.retryAfterMs = delay;
  }
  return observation;
}
function bodyError(body: unknown): ApiFootballFailure | null {
  if (!record(body)) return null;
  if (Array.isArray(body.errors) && body.errors.length === 0) return null;
  if (Array.isArray(body.errors)) return failure("response-body-error");
  if (!record(body.errors) || Object.keys(body.errors).length === 0) return null;
  const errorKeys = Object.keys(body.errors).join(" ").toLowerCase();
  // Diagnostics are classified here and never returned, logged or cached.
  const diagnostics = Object.values(body.errors).filter((item) => typeof item === "string").join(" ").toLowerCase();
  if (/subscription/u.test(errorKeys) && /expir/u.test(diagnostics)) return failure("subscription-expired");
  if (/token|api.?key|authentication/u.test(errorKeys)) return failure("authentication-error");
  if (/ratelimit|requests|quota/u.test(errorKeys)) return failure("rate-limited", true);
  if (/coverage|access|plan|subscription/u.test(errorKeys)) return failure("coverage-error");
  return failure("response-body-error");
}
function feedbackKind(error: ApiFootballFailure): QuotaFeedback["kind"] {
  if (error.reason === "authentication-error") return "credential-failure";
  if (error.reason === "subscription-expired") return "subscription-expired";
  if (error.reason === "rate-limited") return "rate-limited";
  return "provider-error";
}

/** The only provider HTTP boundary. Injected dependencies support isolated, labeled contract tests. */
export function createApiFootballAdapter(options: ApiFootballAdapterOptions) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const capacity = options.cacheCapacity ?? 128;
  if (!positive(capacity) || capacity > 10_000 || !/^[a-f0-9]{64}$/u.test(options.accountId)) throw new Error("Invalid API-Football adapter configuration.");
  const cache = new Map<string, Page<unknown>>();
  const inFlight = new Map<string, Promise<PageOutcome<unknown>>>();
  function authorized(): boolean {
    try {
      const approval: unknown = options.authorize();
      if (approval instanceof Promise) void approval.catch(() => undefined);
      return approval === undefined;
    } catch { return false; }
  }
  function credential(): string | null {
    try { const key = options.credential.read(); return typeof key === "string" && /^[\x21-\x7e]{1,512}$/u.test(key) ? key : null; }
    catch { return null; }
  }
  function permitted<T>(endpoint: ApiFootballEndpoint, bounds: ApiFootballBounds, page: Page<T>): boolean {
    if (bounds.cacheMaxAgeMs === 0 || !options.verifyCacheUse) return false;
    try {
      const approval: unknown = options.verifyCacheUse(Object.freeze({ endpoint, purpose: endpoint === "predictions" ? "fallback-only" : "structured-evidence",
      cacheScope: endpoint === "predictions" ? bounds.cacheScope! : null, maxAgeMs: bounds.cacheMaxAgeMs,
      retrievedAt: page.provenance.retrievedAt, data: page.data }));
      if (approval instanceof Promise) void approval.catch(() => undefined);
      return approval === true;
    } catch { return false; }
  }
  function workflowAllowed(workflow?: ApiFootballFallbackWorkflow): boolean {
    if (workflow === undefined) return true;
    try {
      const checked: unknown = workflow.check();
      if (checked instanceof Promise) void checked.catch(() => undefined);
      return checked === undefined && !workflow.signal.aborted && clock.now() < workflow.deadlineAt;
    } catch { return false; }
  }
  async function request<T>(endpoint: ApiFootballEndpoint, params: Params, bounds: ApiFootballBounds,
    budget: Budget, normalize: Normalize<T>, workflow?: ApiFootballFallbackWorkflow, view?: "reference"): Promise<PageOutcome<T>> {
    const url = new URL(apiFootballEndpoints[endpoint].path, API_FOOTBALL_ORIGIN);
    for (const key of Object.keys(params).sort()) url.searchParams.set(key, params[key]!);
    const workKey = createHash("sha256").update(JSON.stringify([options.accountId, url.href, endpoint === "predictions" ? bounds.cacheScope : null])).digest("hex");
    if (!authorized() || !workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
    if (!credential()) return { error: failure("invalid-credential") };
    const cached = cache.get(workKey) as Page<T> | undefined;
    if (cached && clock.now() >= cached.provenance.retrievedAt && clock.now() - cached.provenance.retrievedAt < bounds.cacheMaxAgeMs && permitted(endpoint, bounds, cached)) {
      if (!workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
      if (clock.now() >= bounds.deadlineAt) return { error: failure("deadline-exceeded") };
      cache.delete(workKey); cache.set(workKey, cached);
      return { page: { ...cached, provenance: { ...cached.provenance, fromCache: true } } };
    }
    // Different byte/row bounds cannot safely reuse an in-flight normalization.
    const joinKey = `${workKey}:${bounds.maxResponseBytes}:${bounds.maxRows}:${view ?? (normalize === normalizeFixtureMatchDetails ? "details" : "default")}`;
    const existing = inFlight.get(joinKey) as Promise<PageOutcome<T>> | undefined;
    if (existing) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([existing, new Promise<PageOutcome<T>>((resolve) => {
          timer = setTimeout(() => resolve({ error: failure("deadline-exceeded") }), Math.min(bounds.timeoutMs, Math.max(0, bounds.deadlineAt - clock.now())));
        })]);
        if (!authorized() || !workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
        return clock.now() >= bounds.deadlineAt ? { error: failure("deadline-exceeded") } : outcome;
      } finally { clearTimeout(timer); }
    }
    const failedObservations: ApiFootballPageProvenance[] = [];
    const pending = dispatch().then((outcome) => ({ ...outcome, provenance: Object.freeze([...failedObservations]) }));
    inFlight.set(joinKey, pending as Promise<PageOutcome<unknown>>);
    try { return await pending; } finally { inFlight.delete(joinKey); }

    async function dispatch(): Promise<PageOutcome<T>> {
      // This caller's request still waiting in the shared queue; released if the caller gives up.
      let queued: string | null = null;
      const outcome = await attempts();
      if (outcome.error && queued !== null) await options.gateway.abandon?.(queued);
      return outcome;
    async function attempts(): Promise<PageOutcome<T>> {
      let lastError: ApiFootballFailure = failure("transport-error", true);
      let attemptId = randomBytes(32).toString("hex");
      let retry = false;
      // A re-reserved queued attempt must repeat its original request exactly; the limiter
      // rejects a changed timeout, so it is fixed per attempt id rather than per pass.
      let attemptTimeoutMs: number | null = null;
      // A queued reservation never outlives its caller: an abandoned waiter would otherwise
      // hold the shared priority queue until its own, later deadline.
      const deadlineAt = workflow === undefined ? bounds.deadlineAt
        : utcInstantFromEpochMilliseconds(Math.min(bounds.deadlineAt, workflow.deadlineAt));
      for (let attempt = 0; attempt < bounds.retry.maxAttempts; attempt++) {
        if (!workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
        try {
          const reserveCheck: unknown = workflow?.beforeReserve?.();
          if (reserveCheck instanceof Promise) void reserveCheck.catch(() => undefined);
          if (reserveCheck !== undefined || !workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
        } catch { return { error: failure("operation-not-authorized") }; }
        if (clock.now() >= deadlineAt) return { error: failure("deadline-exceeded") };
        if (budget.requests >= bounds.maxRequests) return { error: failure("request-budget-exhausted") };
        const key = credential();
        if (!key) return { error: failure("invalid-credential") };
        let captured: ApiFootballFailure | null = null;
        let responseObservation: ApiFootballPageProvenance | null = null;
        let fixtureRows: readonly unknown[] | null = null, competitionRows: readonly unknown[] | null = null;
        let didDispatch = false;
        attemptTimeoutMs ??= Math.min(bounds.timeoutMs, deadlineAt - clock.now());
        const result = await options.gateway.execute({ requestId: attemptId, workKey, priority: bounds.priority,
          deadlineAt, timeoutMs: attemptTimeoutMs, endpoint: url.pathname, retry }, async (signal, _permit, observe) => {
          if (!workflowAllowed(workflow)) throw new Error("Fallback refresh is no longer authorized.");
          const dispatchCheck: unknown = workflow?.beforeDispatch?.();
          if (dispatchCheck instanceof Promise) void dispatchCheck.catch(() => undefined);
          if (dispatchCheck !== undefined) throw new Error("Fallback dispatch is no longer authorized.");
          didDispatch = true; budget.requests++;
          const transportSignal = workflow === undefined ? signal : AbortSignal.any([signal, workflow.signal]);
          const response = await fetcher(url, { method: "GET", headers: { "x-apisports-key": key }, signal: transportSignal,
            redirect: "error", credentials: "omit", cache: "no-store" });
          const retrievedAt = clock.now();
          const observation = quotaHeaders(response, retrievedAt);
          responseObservation = { provider: "api-football", endpoint, requestParameters: Object.freeze({ ...params }),
            contractVersion: API_FOOTBALL_CONTRACT_VERSION, retrievedAt, providerUpdatedAt: null,
            fromCache: false, currentPage: null, totalPages: null, quota: { ...observation, kind: "uncertain" } };
          captured = response.status === 401 ? failure("authentication-error") : response.status === 429 ? failure("rate-limited", true)
            : response.status >= 500 || response.status === 499 ? failure("transport-error", true) : null;
          if (captured) captured = { ...captured, httpStatus: response.status, ...(observation.retryAfterMs === undefined ? {} : { retryAfterMs: observation.retryAfterMs }) };
          observe({ ...observation, kind: captured ? feedbackKind(captured) : "uncertain" });
          let body: unknown;
          try { body = await readBody(response, bounds.maxResponseBytes, transportSignal); }
          catch (error) {
            if (signal.aborted) throw error;
            captured = failure(error instanceof BodyFailure ? error.reason : "response-body-error");
          }
          if (response.status === 401) captured = failure("authentication-error");
          else if (response.status === 429) captured = failure("rate-limited", true);
          else if (response.status >= 500 || response.status === 499) captured = failure("transport-error", true);
          else captured = captured ?? bodyError(body) ?? (!response.ok ? failure("response-body-error") : null);
          if (captured) {
            captured = { ...captured, httpStatus: response.status, ...(observation.retryAfterMs === undefined ? {} : { retryAfterMs: observation.retryAfterMs }) };
            return { value: null, feedback: { ...observation, kind: feedbackKind(captured) } };
          }
          const expectedPage = Number(params.page ?? "1");
          // /status intentionally has an object response and may omit paging.
          const accountStatus = endpoint === "accountStatus";
          const teamStatistics = endpoint === "teamStatistics";
          const payload = record(body) ? body.response : null;
          const objectResponse = (accountStatus || teamStatistics) && record(payload);
          const rows = objectResponse ? [payload] : !accountStatus && Array.isArray(payload) &&
            (!teamStatistics || payload.length === 0) ? payload as unknown[] : null;
          // The team-season statistics envelope counts object fields rather than rows.
          const resultCount = teamStatistics && objectResponse ? Object.keys(payload).length : rows?.length;
          // The documented team seasons example counts one team even with several years in response.
          const oneTeamWithSeasons = endpoint === "teamSeasons" && rows !== null && rows.length > 0;
          const exactReferenceEcho = teamStatistics || endpoint === "oddsMapping" || isFootballHistoryReferenceDictionary(endpoint) ||
            endpoint === "coachProfiles" || endpoint === "teamsByCountry" || endpoint === "venuesByCountry" ||
            endpoint === "playerSeasonHistory" || endpoint === "playerTransfers" ||
            endpoint === "coaches" || endpoint === "squads" || endpoint === "teamSeasons" || isApiFootballLeaderboard(endpoint) ||
            endpoint === "fixtureHalfStatistics" || endpoint === "playerTeams" || isFootballHistoryPersonRecordEndpoint(endpoint) || view === "reference" &&
              (endpoint === "fixtureRounds" || endpoint === "playerStatistics" || endpoint === "playerProfiles");
          const paging = record(body) && record(body.paging) ? body.paging : null;
          const validPaging = accountStatus && record(body) && body.paging === undefined
            || paging !== null && positive(paging.current) && positive(paging.total) && paging.current <= paging.total;
          if (!record(body) || body.get !== apiFootballEndpoints[endpoint].path.slice(1)
            || !(record(body.parameters) || Array.isArray(body.parameters) && body.parameters.length === 0)
            || !(Array.isArray(body.errors) && body.errors.length === 0 || record(body.errors) && Object.keys(body.errors).length === 0)
            || rows === null || !nonnegative(body.results) || (body.results !== resultCount && !(oneTeamWithSeasons && body.results === 1)) || !validPaging
            || exactReferenceEcho && Object.keys(body.parameters).some((key) => !Object.hasOwn(params, key))
            || record(body.parameters) && Object.keys(params).some((key) => Object.hasOwn(body.parameters as object, key)
              && String((body.parameters as Record<string, unknown>)[key]) !== params[key])) {
            captured = failure("schema-error");
            return { value: null, feedback: { ...observation, kind: "provider-error" } };
          }
          // Price and mapping rows carry their own `update` time.
          const carriesUpdate = endpoint === "odds" || endpoint === "inPlayOdds" || endpoint === "oddsMapping";
          const data: T[] = [], missingCoverage = new Set<string>(carriesUpdate ? [] : ["provider-update-time"]);
          if (rows.length === 0) missingCoverage.add(`${endpoint}-coverage-not-established`);
          if (Object.keys(params).some((key) => key !== "timezone" && (!record(body.parameters) || !Object.hasOwn(body.parameters, key)))) {
            captured = failure("coverage-error");
            return { value: null, feedback: { ...observation, kind: "provider-error" } };
          }
          let invalidRows = 0;
          const context: NormalizationContext = { retrievedAt, endpoint: apiFootballEndpoints[endpoint].path,
            ...(options.verifyLogo === undefined ? {} : { verifyLogo: options.verifyLogo }),
            ...(options.verifyRegulationScore === undefined ? {} : { verifyRegulationScore: options.verifyRegulationScore }),
            ...(options.verifyHalfTimeScore === undefined ? {} : { verifyHalfTimeScore: options.verifyHalfTimeScore }) };
          const preMatchCatalog = endpoint === "oddsBets" || endpoint === "oddsBookmakers";
          const catalogIds = new Set<number>();
          for (const row of rows.slice(0, bounds.maxRows)) {
            if (preMatchCatalog && record(row) && positive(row.id) && row.id <= 4_294_967_295) {
              if (catalogIds.has(row.id)) { invalidRows++; continue; }
              catalogIds.add(row.id);
              // API-Football includes unnamed placeholders. They establish ID coverage only.
              if (row.name === null) { missingCoverage.add(`odds-catalog-name:${row.id}`); continue; }
            }
            const normalized = normalize(row, context);
            if (normalized.valid && matchesScope(endpoint, params, normalized.data)) { data.push(normalized.data); for (const missing of normalized.missingCoverage) missingCoverage.add(missing); }
            else invalidRows++;
          }
          let pageError: ApiFootballFailure | null = invalidRows > 0 ? failure("schema-error") : null;
          const pageSize = pageSizeOf(endpoint);
          if (rows.length > bounds.maxRows || pageSize !== null && paging !== null
            && (rows.length > pageSize || Number(paging.current) < Number(paging.total) && rows.length !== pageSize)) pageError = failure("pagination-incomplete");
          if (paging !== null && (paging.current !== expectedPage || (!apiFootballEndpoints[endpoint].paginated && paging.total !== 1))) pageError = failure("pagination-incomplete");
          const page: Page<T> = Object.freeze({ cacheKey: workKey, data: Object.freeze(data), invalidRows, missingCoverage: Object.freeze([...missingCoverage]), error: pageError,
            provenance: Object.freeze({ provider: "api-football", endpoint, requestParameters: Object.freeze({ ...params }), contractVersion: API_FOOTBALL_CONTRACT_VERSION,
              retrievedAt, providerUpdatedAt: null, fromCache: false, currentPage: paging === null ? null : Number(paging.current),
              totalPages: paging === null ? null : Number(paging.total), quota: Object.freeze({ ...observation, kind: "success" }) }) });
          if (options.observeFixturePage && endpoint === "fixtures" && (pageError === null ||
              options.retainPartiallyNormalizedFixturePages && pageError.reason === "schema-error")) fixtureRows = Object.freeze(rows);
          if (options.observeCompetitionPage && endpoint === "competitions" && (pageError === null || pageError.reason === "schema-error")) {
            competitionRows = Object.freeze(rows);
          }
          return { value: page, feedback: { ...observation, kind: "success" } };
        });
        if (result.status === "completed" && result.value) {
          if (!authorized() || !workflowAllowed(workflow)) return { error: failure("operation-not-authorized") };
          if (clock.now() >= bounds.deadlineAt) return { error: failure("deadline-exceeded") };
          if (fixtureRows !== null) await options.observeFixturePage?.(fixtureRows, result.value.provenance);
          if (competitionRows !== null) await options.observeCompetitionPage?.(competitionRows, result.value.provenance);
          return { page: result.value };
        }
        if (responseObservation) {
          const observed = responseObservation as ApiFootballPageProvenance;
          failedObservations.push(Object.freeze({ ...observed, quota: Object.freeze({ ...observed.quota,
            kind: result.status === "failed" ? result.reason : "uncertain" }) }));
        }
        queued = result.status === "denied" && result.reason !== "operation-not-authorized" && !didDispatch ? attemptId : null;
        if (result.status === "joined") return { error: failure("shared-work-pending") };
        if (result.status === "denied") {
          if (result.reason === "operation-not-authorized") return { error: failure("operation-not-authorized") };
          // Rolling second/minute windows that name their reopening are transient like pacing.
          const transient = ["pacing", "retry-delay", "priority-wait"].includes(result.reason) ||
            ["second-limit", "minute-limit"].includes(result.reason) && result.retryAt !== undefined;
          lastError = { ...failure("quota-denied", transient), quotaReason: result.reason,
            ...(result.retryAt === undefined ? {} : { retryAt: result.retryAt }) };
        } else lastError = captured ?? failure("transport-error", true);
        if (didDispatch) { attemptId = randomBytes(32).toString("hex"); attemptTimeoutMs = null; retry = true; }
        if (!lastError.retryable || attempt + 1 >= bounds.retry.maxAttempts || budget.requests >= bounds.maxRequests) return { error: lastError };
        const jitter = Math.min(1, Math.max(0, random()));
        const backoff = Math.ceil(Math.min(bounds.retry.maxDelayMs, bounds.retry.baseDelayMs * 2 ** Math.min(attempt, 30)) * jitter);
        const delay = Math.max(backoff, lastError.retryAfterMs ?? 0, lastError.retryAt === undefined ? 0 : lastError.retryAt - clock.now());
        if (!nonnegative(delay) || delay >= deadlineAt - clock.now() || delay > 2_147_483_647) return { error: lastError };
        await sleep(delay);
      }
      return { error: lastError };
    }
    }
  }
  function finished<T>(data: readonly T[], pages: readonly ApiFootballPageProvenance[], missingCoverage: readonly string[],
    invalidRows: number, budget: Budget, error: ApiFootballFailure | null, missingIds: readonly number[] = []): ApiFootballResult<T> {
    return Object.freeze({ status: error ? (data.length > 0 || pages.some((page) => page.totalPages !== null) ? "partial" : "failed") : "complete", data: Object.freeze([...data]),
      completeness: Object.freeze({ complete: error === null, reasons: Object.freeze(error ? [error.reason] : []), missingIds: Object.freeze([...missingIds]),
        missingCoverage: Object.freeze([...new Set(missingCoverage)]), invalidRows }), provenance: Object.freeze([...pages]),
      requestsDispatched: budget.requests, error: error ? Object.freeze(error) : null });
  }
  async function run<T>(endpoint: ApiFootballEndpoint, queries: readonly Params[] | null, bounds: ApiFootballBounds,
    normalize: Normalize<T>, expectedIds?: readonly number[], workflow?: ApiFootballFallbackWorkflow, view?: "reference",
    singlePage?: number): Promise<ApiFootballResult<T>> {
    const budget: Budget = { requests: 0 }, data: T[] = [], pages: ApiFootballPageProvenance[] = [], missingCoverage: string[] = [];
    if (!queries || !validBounds(bounds, clock.now(), endpoint === "predictions")) return finished(data, pages, [], 0, budget, failure("invalid-request"));
    let error: ApiFootballFailure | null = null, invalidRows = 0;
    const retrievedPages: Page<T>[] = [];
    const identities = new Set<number>();
    const rowIdentities = new Set<string>();
    for (const query of queries) {
      let pageNumber = singlePage ?? 1, totalPages: number | null = null;
      do {
        if (retrievedPages.length >= bounds.maxPages || data.length >= bounds.maxRows) { error = failure("pagination-incomplete"); break; }
        const outcome = await request(endpoint, apiFootballEndpoints[endpoint].paginated ? { ...query, page: String(pageNumber) } : query, bounds, budget, normalize, workflow, view);
        if (outcome.provenance) pages.push(...outcome.provenance);
        if (!outcome.page) { error = outcome.error ?? failure("transport-error"); break; }
        const page = outcome.page;
        retrievedPages.push(page);
        pages.push(page.provenance); missingCoverage.push(...page.missingCoverage); invalidRows += page.invalidRows;
        if (totalPages !== null && totalPages !== page.provenance.totalPages) error = failure("pagination-incomplete");
        totalPages = page.provenance.totalPages;
        for (const row of page.data) {
          const id = record(row) && positive(row.id) ? row.id : record(row) && record(row.player) && positive(row.player.id) ? row.player.id : null;
          const teamId = record(row) && record(row.team) && positive(row.team.id) ? row.team.id : null;
          const injuryPlayer = record(row) && record(row.reportedInjury) && positive(row.reportedInjury.playerId) ? row.reportedInjury.playerId : null;
          // Normalized odds rows have no `id`; a fixture repeated across pages is a schema error.
          const identity = (endpoint === "odds" || endpoint === "inPlayOdds") && record(row) && positive(row.fixtureId) ? `odds:${row.fixtureId}`
            : id !== null ? `id:${id}` : endpoint === "injuries" && teamId !== null && injuryPlayer !== null
            ? `injury:${teamId}:${injuryPlayer}:${query.fixture}` : teamId !== null && endpoint !== "injuries" ? `team:${teamId}` : endpoint === "predictions" ? `prediction:${query.fixture}` : null;
          if ((identity !== null && rowIdentities.has(identity)) || (endpoint === "fixtures" && expectedIds && (id === null || !expectedIds.includes(id)))) {
            invalidRows++; error = failure("schema-error"); continue;
          }
          if (id !== null) identities.add(id);
          if (identity !== null) rowIdentities.add(identity);
          if (data.length >= bounds.maxRows) { error = failure("pagination-incomplete"); break; }
          data.push(row);
        }
        error = error ?? page.error;
        if (error || singlePage !== undefined) break;
        if (apiFootballEndpoints[endpoint].paginated && page.data.length === 0 && totalPages !== null && pageNumber < totalPages) { error = failure("pagination-incomplete"); break; }
        pageNumber++;
      } while (apiFootballEndpoints[endpoint].paginated && pageNumber <= totalPages!);
      if (error) break;
    }
    const missingIds = expectedIds?.filter((id) => !identities.has(id)) ?? [];
    if (missingIds.length > 0) error = error ?? failure("coverage-error");
    if (!authorized() || !workflowAllowed(workflow)) return finished([], [], [], 0, budget, failure("operation-not-authorized"));
    if (clock.now() >= bounds.deadlineAt) return finished([], [], [], 0, budget, failure("deadline-exceeded"));
    if (error === null) for (const page of retrievedPages) {
      if (permitted(endpoint, bounds, page)) {
        if (!workflowAllowed(workflow)) return finished([], [], [], 0, budget, failure("operation-not-authorized"));
        cache.delete(page.cacheKey); cache.set(page.cacheKey, page);
        while (cache.size > capacity) cache.delete(cache.keys().next().value!);
      }
    }
    if (!authorized() || !workflowAllowed(workflow)) return finished([], [], [], 0, budget, failure("operation-not-authorized"));
    if (clock.now() >= bounds.deadlineAt) {
      for (const page of retrievedPages) cache.delete(page.cacheKey);
      return finished([], [], [], 0, budget, failure("deadline-exceeded"));
    }
    return finished(data, pages, missingCoverage, invalidRows, budget, error, missingIds);
  }
  function paired(query: PlayerStatisticsQuery, extraKeys: readonly string[] = []): Params | null {
    return keysAllowed(query, ["competitionId", "season", ...extraKeys]) && positive(query.competitionId) && positive(query.season) && query.season <= 9999
      ? { league: String(query.competitionId), season: String(query.season) } : null;
  }
  const fixtureQueries = (query: FixtureQuery, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => {
    if (query?.fixtureIds !== undefined) {
      const ids = query.fixtureIds;
      const valid = keysAllowed(query, ["fixtureIds"]) && Array.isArray(ids) && ids.length > 0 &&
        ids.length <= fixtureBatchMaximum() && ids.every(positive) && new Set(ids).size === ids.length;
      return run("fixtures", valid ? [{ [ids.length === 1 ? "id" : "ids"]: [...ids].sort((a, b) => a - b).join("-"),
        timezone: "Africa/Kampala" }] : null,
        bounds, normalizeFixture, valid ? ids : undefined, workflow);
    }
    const params = queryParams(query);
    return run("fixtures", params ? [params] : null, bounds, normalizeFixture, query?.fixtureId === undefined ? undefined : [query.fixtureId], workflow);
  };
  function fixtureBatchMaximum() {
    const evidence = options.batchEvidence;
    try {
      if (evidence && positive(evidence.maximumIds) && evidence.maximumIds <= 20 && typeof evidence.evidenceRef === "string" && evidence.evidenceRef.trim()
        && options.verifyBatchEvidence?.(evidence) === true) return evidence.maximumIds;
    } catch { /* Unverified support falls back to single-ID lookups. */ }
    return 1;
  }
  function fixtureIds<T>(ids: readonly number[], bounds: ApiFootballBounds, normalize: Normalize<T>, workflow?: ApiFootballFallbackWorkflow) {
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(positive)) return run("fixtures", null, bounds, normalize);
    const requested = [...new Set(ids)].sort((a, b) => a - b);
    const maximum = fixtureBatchMaximum();
    const queries: Params[] = [];
    for (let offset = 0; offset < requested.length; offset += maximum) {
      const chunk = requested.slice(offset, offset + maximum);
      queries.push({ [maximum === 1 ? "id" : "ids"]: chunk.join("-"), timezone: "Africa/Kampala" });
    }
    return run("fixtures", queries, bounds, normalize, requested, workflow);
  }
  return Object.freeze({
    evidence: Object.freeze({
      accountStatus: (bounds: ApiFootballBounds) => run("accountStatus", [{}], bounds, normalizeAccountStatus),
      fixtures: fixtureQueries,
      fixtureRounds(query: FixtureRoundQuery, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) {
        const params = paired(query) ? apiFootballFixtureRoundParameters(query) : null;
        return run("fixtureRounds", params ? [params] : null, { ...bounds, cacheMaxAgeMs: 0 }, (raw) => {
          const data = parseApiFootballFixtureRound(raw);
          return data ? { valid: true, data, missingCoverage: [] } : { valid: false, reason: "schema-error" };
        }, undefined, workflow);
      },
      fixturesByDate: (date: string, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => fixtureQueries({ date }, bounds, workflow),
      liveFixtures: (bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => run("fixtures", [{ live: "all", timezone: "Africa/Kampala" }], bounds, normalizeFixture, undefined, workflow),
      unresolvedFixtures(ids: readonly number[], bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow): Promise<ApiFootballResult<NormalizedFixture>> {
        return fixtureIds(ids, bounds, normalizeFixture, workflow);
      },
      matchDetails(ids: readonly number[], bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow): Promise<ApiFootballResult<NormalizedFixtureMatchDetails>> {
        // The fixture transport uses the same quota ledger as scores and all other football work.
        return fixtureIds(ids, { ...bounds, cacheMaxAgeMs: 0 }, normalizeFixtureMatchDetails, workflow);
      },
      teams(query: TeamQuery, bounds: ApiFootballBounds) {
        const params = keysAllowed(query, ["teamId"]) && "teamId" in query && positive(query.teamId) ? { id: String(query.teamId) } : paired(query as PlayerStatisticsQuery);
        return run("teams", params ? [params] : null, bounds, normalizeTeam);
      },
      competitions(query: CompetitionQuery, bounds: ApiFootballBounds) {
        const valid = keysAllowed(query, ["competitionId", "season"]) && (query.competitionId === undefined || positive(query.competitionId))
          && (query.season === undefined || positive(query.season) && query.season <= 9999);
        const params: Record<string, string> = {};
        if (query?.competitionId !== undefined) params.id = String(query.competitionId);
        if (query?.season !== undefined) params.season = String(query.season);
        return run("competitions", valid ? [params] : null, bounds, normalizeCompetition);
      },
      statistics: (fixtureId: number, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => run("statistics", positive(fixtureId) ? [{ fixture: String(fixtureId) }] : null, bounds, normalizeStatistics, undefined, workflow),
      events: (fixtureId: number, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => run("events", positive(fixtureId) ? [{ fixture: String(fixtureId) }] : null, bounds, normalizeEvent, undefined, workflow),
      availability: (fixtureId: number, kind: "lineups" | "injuries", bounds: ApiFootballBounds) => run(kind === "injuries" ? "injuries" : "lineups",
        positive(fixtureId) && ["lineups", "injuries"].includes(kind) ? [{ fixture: String(fixtureId) }] : null, bounds, (raw, context) => normalizeAvailability(raw, kind, context)),
      playerStatistics: (query: PlayerStatisticsQuery, bounds: ApiFootballBounds) => {
        const pairedParams = paired(query, ["teamId"]), team = query.teamId;
        const params = pairedParams && (team === undefined || positive(team))
          ? { ...pairedParams, ...(team === undefined ? {} : { team: String(team) }) } : null;
        return run("playerStatistics", params ? [params] : null, bounds, normalizePlayerStatistics);
      },
    }),
    reference: Object.freeze({
      playerStatisticsPage(selector: FootballHistoryPlayerStatisticsSelector, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) {
        const params = paired(selector, ["page"]);
        const valid = params !== null && playerStatisticsProviderId(selector.competitionId) && selector.season >= 1000 && positive(selector.page);
        return run("playerStatistics", valid ? [params] : null, { ...bounds, cacheMaxAgeMs: 0 },
          (raw) => archivePlayerRow(raw, archivedPlayerStatisticsRowId(raw, selector)), undefined, workflow, "reference", valid ? selector.page : undefined);
      },
      playerProfilePage(selector: FootballHistoryPlayerProfileSelector, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) {
        const valid = keysAllowed(selector, ["page"]) && positive(selector.page);
        return run("playerProfiles", valid ? [{}] : null, { ...bounds, cacheMaxAgeMs: 0 },
          (raw) => archivePlayerRow(raw, archivedPlayerProfileRowId(raw)), undefined, workflow, "reference", valid ? selector.page : undefined);
      },
      page(target: FootballHistoryReferenceTarget, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) {
        const params = apiFootballReferenceParameters(target);
        const rowLimit = target?.endpoint === "playerTransfers" ? 1 :
          target?.endpoint === "fixtureHalfStatistics" ? 2 : isApiFootballLeaderboard(target?.endpoint) ? 20 : null;
        const maxRows = rowLimit !== null && positive(bounds?.maxRows) ? Math.min(bounds.maxRows, rowLimit) : bounds?.maxRows;
        return run(target?.endpoint, params ? [params] : null, { ...bounds, maxRows, cacheMaxAgeMs: 0 },
          (raw) => normalizeReferenceRow(raw, target), undefined, workflow, "reference");
      },
    }),
    fallback: Object.freeze({ predictions: (fixtureId: number, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow) => run("predictions",
      positive(fixtureId) ? [{ fixture: String(fixtureId) }] : null, bounds, normalizeFallbackPrediction, undefined, workflow) }),
    // Kept outside evidence and fallback so bookmaker prices never reach AI or fallback forecasts.
    odds: Object.freeze({
      prices: (query: OddsSweepQuery, bounds: ApiFootballBounds) => { const params = oddsParams(query); return run("odds", params ? [params] : null, bounds, normalizeOdds); },
      mappingPage: (page: number, bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) =>
        run("oddsMapping", positive(page) ? [{}] : null, { ...bounds, cacheMaxAgeMs: 0 }, (raw, context) => {
          const data = normalizeFootballHistoryOddsMapping(raw, context.retrievedAt);
          return data ? { valid: true, data, missingCoverage: [] } : { valid: false, reason: "schema-error" };
        }, undefined, workflow, "reference", page),
      bets: (bounds: ApiFootballBounds) => run("oddsBets", [{}], bounds, normalizeOddsCatalogEntry),
      bookmakers: (bounds: ApiFootballBounds) => run("oddsBookmakers", [{}], bounds, normalizeOddsCatalogEntry),
      inPlay: (bounds: ApiFootballBounds) => run("inPlayOdds", [{}], bounds, normalizeInPlayOdds),
      inPlayBets: (bounds: ApiFootballBounds) => run("inPlayOddsBets", [{}], bounds, normalizeOddsCatalogEntry),
    }),
  });
}

/** Production construction uses the existing trusted runtime and account authorization gates. */
export function createPolicyApiFootballAdapter(options: Omit<ApiFootballAdapterOptions, "credential" | "gateway" | "authorize"> & {
  policy: RuntimePolicy; limiter: GatewayQuotaLimiter; verifyEvidence?: EvidenceVerifier;
}) {
  if (isDevelopmentDemo() && options.policy.mode === "development") {
    const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
    return createApiFootballAdapter({ ...options, accountId: demoFootballAccountId, clock,
      credential: { read: () => "synthetic-development-demo" }, authorize: authorizeDemoFootball,
      gateway: createDemoFootballGateway(clock), fetcher: createDemoApiFootballFetch({ now: () => clock.now() }),
      verifyLogo: () => true, verifyRegulationScore: () => true, verifyHalfTimeScore: () => true,
    });
  }
  return createApiFootballAdapter({ ...options,
    credential: { read: () => options.policy.secrets.footballKey?.read() ?? "" },
    authorize: () => assertOperationAllowed(options.policy, "football", options.verifyEvidence),
    gateway: createPolicyQuotaGateway(options),
  });
}
