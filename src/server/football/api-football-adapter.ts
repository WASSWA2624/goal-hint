import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { assertOperationAllowed, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { API_FOOTBALL_ORIGIN, API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints,
  type ApiFootballBounds, type ApiFootballEndpoint, type ApiFootballFailure,
  type ApiFootballPageProvenance, type ApiFootballResult, type ApiFootballCachePermission,
  type ApiFootballBatchEvidence } from "./api-football-contract.ts";
import { normalizeFixture, normalizeTeam, normalizeCompetition, normalizeStatistics,
  normalizeAvailability, normalizePlayerStatistics, normalizeFallbackPrediction,
  type NormalizationContext, type NormalizationResult, type NormalizedFixture } from "./api-football-normalize.ts";
import { createPolicyQuotaGateway, type createQuotaGateway, type GatewayQuotaLimiter } from "./quota-gateway.ts";
import { quotaPriorities, type QuotaFeedback } from "./quota-contract.ts";

export type FixtureQuery = Readonly<{ date?: string; competitionId?: number; season?: number;
  teamId?: number; from?: string; to?: string; round?: string; fixtureId?: number }>;
export type TeamQuery = Readonly<{ teamId: number }> | Readonly<{ competitionId: number; season: number }>;
export type CompetitionQuery = Readonly<{ competitionId?: number; season?: number }>;
export type PlayerStatisticsQuery = Readonly<{ competitionId: number; season: number }>;
export type ApiFootballAdapterOptions = Readonly<{
  accountId: string;
  credential: Readonly<{ read(): string }>;
  gateway: Pick<ReturnType<typeof createQuotaGateway>, "execute">;
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
  cacheCapacity?: number;
}>;
type Params = Readonly<Record<string, string>>;
type Normalize<T> = (raw: unknown, context: NormalizationContext) => NormalizationResult<T>;
type Page<T> = Readonly<{ cacheKey: string; data: readonly T[]; provenance: ApiFootballPageProvenance & { currentPage: number; totalPages: number };
  missingCoverage: readonly string[]; invalidRows: number; error: ApiFootballFailure | null }>;
type Budget = { requests: number };
type PageOutcome<T> = Readonly<{ page?: Page<T>; error?: ApiFootballFailure; provenance?: readonly ApiFootballPageProvenance[] }>;
const failure = (reason: ApiFootballFailure["reason"], retryable = false): ApiFootballFailure => ({ reason, retryable });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const keysAllowed = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => record(value) && Object.keys(value).every((key) => keys.includes(key));

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
      && statistic.competition.id === Number(params.league) && statistic.competition.season === Number(params.season))) return false;
  if (endpoint === "injuries" && row.fixtureId !== null && row.fixtureId !== Number(params.fixture)) return false;
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
  function authorized(): boolean { try { options.authorize(); return true; } catch { return false; } }
  function credential(): string | null {
    try { const key = options.credential.read(); return typeof key === "string" && /^[\x21-\x7e]{1,512}$/u.test(key) ? key : null; }
    catch { return null; }
  }
  function permitted<T>(endpoint: ApiFootballEndpoint, bounds: ApiFootballBounds, page: Page<T>): boolean {
    if (bounds.cacheMaxAgeMs === 0 || !options.verifyCacheUse) return false;
    try { return options.verifyCacheUse(Object.freeze({ endpoint, purpose: endpoint === "predictions" ? "fallback-only" : "structured-evidence",
      cacheScope: endpoint === "predictions" ? bounds.cacheScope! : null, maxAgeMs: bounds.cacheMaxAgeMs,
      retrievedAt: page.provenance.retrievedAt, data: page.data })) === true; } catch { return false; }
  }
  async function request<T>(endpoint: ApiFootballEndpoint, params: Params, bounds: ApiFootballBounds,
    budget: Budget, normalize: Normalize<T>): Promise<PageOutcome<T>> {
    const url = new URL(apiFootballEndpoints[endpoint].path, API_FOOTBALL_ORIGIN);
    for (const key of Object.keys(params).sort()) url.searchParams.set(key, params[key]!);
    const workKey = createHash("sha256").update(JSON.stringify([options.accountId, url.href, endpoint === "predictions" ? bounds.cacheScope : null])).digest("hex");
    if (!authorized()) return { error: failure("operation-not-authorized") };
    if (!credential()) return { error: failure("invalid-credential") };
    const cached = cache.get(workKey) as Page<T> | undefined;
    if (cached && clock.now() >= cached.provenance.retrievedAt && clock.now() - cached.provenance.retrievedAt < bounds.cacheMaxAgeMs && permitted(endpoint, bounds, cached)) {
      if (clock.now() >= bounds.deadlineAt) return { error: failure("deadline-exceeded") };
      cache.delete(workKey); cache.set(workKey, cached);
      return { page: { ...cached, provenance: { ...cached.provenance, fromCache: true } } };
    }
    // Different byte/row bounds cannot safely reuse an in-flight normalization.
    const joinKey = `${workKey}:${bounds.maxResponseBytes}:${bounds.maxRows}`;
    const existing = inFlight.get(joinKey) as Promise<PageOutcome<T>> | undefined;
    if (existing) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([existing, new Promise<PageOutcome<T>>((resolve) => {
          timer = setTimeout(() => resolve({ error: failure("deadline-exceeded") }), Math.min(bounds.timeoutMs, Math.max(0, bounds.deadlineAt - clock.now())));
        })]);
        if (!authorized()) return { error: failure("operation-not-authorized") };
        return clock.now() >= bounds.deadlineAt ? { error: failure("deadline-exceeded") } : outcome;
      } finally { clearTimeout(timer); }
    }
    const failedObservations: ApiFootballPageProvenance[] = [];
    const pending = dispatch().then((outcome) => ({ ...outcome, provenance: Object.freeze([...failedObservations]) }));
    inFlight.set(joinKey, pending as Promise<PageOutcome<unknown>>);
    try { return await pending; } finally { inFlight.delete(joinKey); }

    async function dispatch(): Promise<PageOutcome<T>> {
      let lastError: ApiFootballFailure = failure("transport-error", true);
      let attemptId = randomBytes(32).toString("hex");
      for (let attempt = 0; attempt < bounds.retry.maxAttempts; attempt++) {
        if (clock.now() >= bounds.deadlineAt) return { error: failure("deadline-exceeded") };
        if (budget.requests >= bounds.maxRequests) return { error: failure("request-budget-exhausted") };
        const key = credential();
        if (!key) return { error: failure("invalid-credential") };
        let captured: ApiFootballFailure | null = null;
        let responseObservation: ApiFootballPageProvenance | null = null;
        let didDispatch = false;
        const result = await options.gateway.execute({ requestId: attemptId, workKey, priority: bounds.priority,
          deadlineAt: bounds.deadlineAt, timeoutMs: Math.min(bounds.timeoutMs, bounds.deadlineAt - clock.now()) }, async (signal, _permit, observe) => {
          didDispatch = true; budget.requests++;
          const response = await fetcher(url, { method: "GET", headers: { "x-apisports-key": key }, signal,
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
          try { body = await readBody(response, bounds.maxResponseBytes, signal); }
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
          if (!record(body) || body.get !== apiFootballEndpoints[endpoint].path.slice(1)
            || !(record(body.parameters) || Array.isArray(body.parameters) && body.parameters.length === 0)
            || !(Array.isArray(body.errors) && body.errors.length === 0 || record(body.errors) && Object.keys(body.errors).length === 0)
            || !Array.isArray(body.response) || !nonnegative(body.results) || body.results !== body.response.length
            || !record(body.paging) || !positive(body.paging.current) || !positive(body.paging.total)
            || body.paging.current > body.paging.total
            || record(body.parameters) && Object.keys(params).some((key) => Object.hasOwn(body.parameters as object, key)
              && String((body.parameters as Record<string, unknown>)[key]) !== params[key])) {
            captured = failure("schema-error");
            return { value: null, feedback: { ...observation, kind: "provider-error" } };
          }
          const data: T[] = [], missingCoverage = new Set<string>(["provider-update-time"]);
          if (body.response.length === 0) missingCoverage.add(`${endpoint}-coverage-not-established`);
          if (Object.keys(params).some((key) => key !== "timezone" && (!record(body.parameters) || !Object.hasOwn(body.parameters, key)))) {
            captured = failure("coverage-error");
            return { value: null, feedback: { ...observation, kind: "provider-error" } };
          }
          let invalidRows = 0;
          const context: NormalizationContext = { retrievedAt, endpoint: apiFootballEndpoints[endpoint].path,
            ...(options.verifyLogo === undefined ? {} : { verifyLogo: options.verifyLogo }),
            ...(options.verifyRegulationScore === undefined ? {} : { verifyRegulationScore: options.verifyRegulationScore }) };
          for (const row of body.response.slice(0, bounds.maxRows)) {
            const normalized = normalize(row, context);
            if (normalized.valid && matchesScope(endpoint, params, normalized.data)) { data.push(normalized.data); for (const missing of normalized.missingCoverage) missingCoverage.add(missing); }
            else invalidRows++;
          }
          let pageError: ApiFootballFailure | null = invalidRows > 0 ? failure("schema-error") : null;
          if (body.response.length > bounds.maxRows || endpoint === "playerStatistics"
            && (body.response.length > 20 || body.paging.current < body.paging.total && body.response.length !== 20)) pageError = failure("pagination-incomplete");
          if (body.paging.current !== expectedPage || (!apiFootballEndpoints[endpoint].paginated && body.paging.total !== 1)) pageError = failure("pagination-incomplete");
          const page: Page<T> = Object.freeze({ cacheKey: workKey, data: Object.freeze(data), invalidRows, missingCoverage: Object.freeze([...missingCoverage]), error: pageError,
            provenance: Object.freeze({ provider: "api-football", endpoint, requestParameters: Object.freeze({ ...params }), contractVersion: API_FOOTBALL_CONTRACT_VERSION,
              retrievedAt, providerUpdatedAt: null, fromCache: false, currentPage: body.paging.current,
              totalPages: body.paging.total, quota: Object.freeze({ ...observation, kind: "success" }) }) });
          return { value: page, feedback: { ...observation, kind: "success" } };
        });
        if (result.status === "completed" && result.value) {
          if (!authorized()) return { error: failure("operation-not-authorized") };
          if (clock.now() >= bounds.deadlineAt) return { error: failure("deadline-exceeded") };
          return { page: result.value };
        }
        if (responseObservation) {
          const observed = responseObservation as ApiFootballPageProvenance;
          failedObservations.push(Object.freeze({ ...observed, quota: Object.freeze({ ...observed.quota,
            kind: result.status === "failed" ? result.reason : "uncertain" }) }));
        }
        if (result.status === "joined") return { error: failure("shared-work-pending") };
        if (result.status === "denied") {
          if (result.reason === "operation-not-authorized") return { error: failure("operation-not-authorized") };
          lastError = { ...failure("quota-denied", ["pacing", "retry-delay", "priority-wait"].includes(result.reason)), quotaReason: result.reason,
            ...(result.retryAt === undefined ? {} : { retryAt: result.retryAt }) };
        } else lastError = captured ?? failure("transport-error", true);
        if (didDispatch) attemptId = randomBytes(32).toString("hex");
        if (!lastError.retryable || attempt + 1 >= bounds.retry.maxAttempts || budget.requests >= bounds.maxRequests) return { error: lastError };
        const jitter = Math.min(1, Math.max(0, random()));
        const backoff = Math.ceil(Math.min(bounds.retry.maxDelayMs, bounds.retry.baseDelayMs * 2 ** Math.min(attempt, 30)) * jitter);
        const delay = Math.max(backoff, lastError.retryAfterMs ?? 0, lastError.retryAt === undefined ? 0 : lastError.retryAt - clock.now());
        if (!nonnegative(delay) || delay >= bounds.deadlineAt - clock.now() || delay > 2_147_483_647) return { error: lastError };
        await sleep(delay);
      }
      return { error: lastError };
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
    normalize: Normalize<T>, expectedIds?: readonly number[]): Promise<ApiFootballResult<T>> {
    const budget: Budget = { requests: 0 }, data: T[] = [], pages: ApiFootballPageProvenance[] = [], missingCoverage: string[] = [];
    if (!queries || !validBounds(bounds, clock.now(), endpoint === "predictions")) return finished(data, pages, [], 0, budget, failure("invalid-request"));
    let error: ApiFootballFailure | null = null, invalidRows = 0;
    const retrievedPages: Page<T>[] = [];
    const identities = new Set<number>();
    const rowIdentities = new Set<string>();
    for (const query of queries) {
      let pageNumber = 1, totalPages: number | null = null;
      do {
        if (retrievedPages.length >= bounds.maxPages || data.length >= bounds.maxRows) { error = failure("pagination-incomplete"); break; }
        const outcome = await request(endpoint, apiFootballEndpoints[endpoint].paginated ? { ...query, page: String(pageNumber) } : query, bounds, budget, normalize);
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
          const identity = id !== null ? `id:${id}` : endpoint === "injuries" && teamId !== null && injuryPlayer !== null
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
        if (error) break;
        if (apiFootballEndpoints[endpoint].paginated && page.data.length === 0 && pageNumber < totalPages) { error = failure("pagination-incomplete"); break; }
        pageNumber++;
      } while (apiFootballEndpoints[endpoint].paginated && pageNumber <= totalPages!);
      if (error) break;
    }
    const missingIds = expectedIds?.filter((id) => !identities.has(id)) ?? [];
    if (missingIds.length > 0) error = error ?? failure("coverage-error");
    if (!authorized()) return finished([], [], [], 0, budget, failure("operation-not-authorized"));
    if (clock.now() >= bounds.deadlineAt) return finished([], [], [], 0, budget, failure("deadline-exceeded"));
    if (error === null) for (const page of retrievedPages) {
      if (permitted(endpoint, bounds, page)) {
        cache.delete(page.cacheKey); cache.set(page.cacheKey, page);
        while (cache.size > capacity) cache.delete(cache.keys().next().value!);
      }
    }
    if (!authorized()) return finished([], [], [], 0, budget, failure("operation-not-authorized"));
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
  const fixtureQueries = (query: FixtureQuery, bounds: ApiFootballBounds) => {
    const params = queryParams(query);
    return run("fixtures", params ? [params] : null, bounds, normalizeFixture, query?.fixtureId === undefined ? undefined : [query.fixtureId]);
  };
  return Object.freeze({
    evidence: Object.freeze({
      fixtures: fixtureQueries,
      fixturesByDate: (date: string, bounds: ApiFootballBounds) => fixtureQueries({ date }, bounds),
      liveFixtures: (bounds: ApiFootballBounds) => run("fixtures", [{ live: "all", timezone: "Africa/Kampala" }], bounds, normalizeFixture),
      unresolvedFixtures(ids: readonly number[], bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedFixture>> {
        if (!Array.isArray(ids) || ids.length === 0 || !ids.every(positive)) return run("fixtures", null, bounds, normalizeFixture);
        const requested = [...new Set(ids)].sort((a, b) => a - b);
        let maximum = 1;
        const evidence = options.batchEvidence;
        try {
          if (evidence && positive(evidence.maximumIds) && evidence.maximumIds <= 20 && typeof evidence.evidenceRef === "string" && evidence.evidenceRef.trim()
            && options.verifyBatchEvidence?.(evidence) === true) maximum = evidence.maximumIds;
        } catch { /* Unverified support falls back to single-ID lookups. */ }
        const queries: Params[] = [];
        for (let offset = 0; offset < requested.length; offset += maximum) {
          const chunk = requested.slice(offset, offset + maximum);
          queries.push({ [maximum === 1 ? "id" : "ids"]: chunk.join("-"), timezone: "Africa/Kampala" });
        }
        return run("fixtures", queries, bounds, normalizeFixture, requested);
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
      statistics: (fixtureId: number, bounds: ApiFootballBounds) => run("statistics", positive(fixtureId) ? [{ fixture: String(fixtureId) }] : null, bounds, normalizeStatistics),
      availability: (fixtureId: number, kind: "lineups" | "injuries", bounds: ApiFootballBounds) => run(kind === "injuries" ? "injuries" : "lineups",
        positive(fixtureId) && ["lineups", "injuries"].includes(kind) ? [{ fixture: String(fixtureId) }] : null, bounds, (raw, context) => normalizeAvailability(raw, kind, context)),
      playerStatistics: (query: PlayerStatisticsQuery, bounds: ApiFootballBounds) => { const params = paired(query); return run("playerStatistics", params ? [params] : null, bounds, normalizePlayerStatistics); },
    }),
    fallback: Object.freeze({ predictions: (fixtureId: number, bounds: ApiFootballBounds) => run("predictions",
      positive(fixtureId) ? [{ fixture: String(fixtureId) }] : null, bounds, normalizeFallbackPrediction) }),
  });
}

/** Production construction uses the existing trusted runtime and account authorization gates. */
export function createPolicyApiFootballAdapter(options: Omit<ApiFootballAdapterOptions, "credential" | "gateway" | "authorize"> & {
  policy: RuntimePolicy; limiter: GatewayQuotaLimiter; verifyEvidence?: EvidenceVerifier;
}) {
  return createApiFootballAdapter({ ...options,
    credential: { read: () => options.policy.secrets.footballKey?.read() ?? "" },
    authorize: () => assertOperationAllowed(options.policy, "football", options.verifyEvidence),
    gateway: createPolicyQuotaGateway(options),
  });
}
