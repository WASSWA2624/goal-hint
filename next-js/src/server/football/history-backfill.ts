import "server-only";

import { createHash } from "node:crypto";
import { getReportingDate, utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballFixtureRoundParameters, type ApiFootballBounds, type ApiFootballFallbackWorkflow,
  type ApiFootballFixtureRound, type ApiFootballResult, type FixtureRoundQuery } from "./api-football-contract.ts";
import { normalizeCompetition, type NormalizationContext, type NormalizedCompetition } from "./api-football-normalize.ts";
import { catalogPersistenceUnavailable, type FootballCatalogStore } from "./catalog-mysql-store.ts";
import { CatalogPersistenceDeferredError, type createFootballCatalogImporter } from "./catalog-service.ts";
import { reviewedHistoryFixtureRepair } from "./history-fixture-correction.ts";
import { footballHistoryFixtureScopeFingerprint } from "./history-fixture-scope.ts";
import { footballHistorySourceMaxRows } from "./history-source.ts";

export const historyBackfillLimits = Object.freeze({ defaultRequests: 6, maximumRequests: 100 });
const retryDelayMs = 15 * 60_000;
const consecutiveTransportLimit = 3;
const previousWholeSeasonRowLimit = 5_000;
const transportFailures = new Set(["transport-error", "deadline-exceeded"]);
const stopReasons = new Set(["quota-denied", "rate-limited", "operation-not-authorized", "authentication-error",
  "invalid-credential", "subscription-expired"]);

type LeagueSeason = FixtureRoundQuery;
type FixtureScope = LeagueSeason & Readonly<{ round?: string }>;
type FixtureSelector = Readonly<{ league: string; season: string; timezone: string; round?: string }>;
type FixtureSourceObservation = Readonly<{ retrievedAt: number; rowCount: number; pageId?: string }>;
type SeasonCoverage = Readonly<Record<string, boolean | null>>;
type HistoricalImport = FixtureScope & Readonly<{ status: string; received: number; imported: number; requests: number; reasons: readonly string[] }>;
type CompetitionsReader = ReturnType<typeof createApiFootballAdapter>["evidence"]["competitions"];
type ArchiveCompetition = Pick<NormalizedCompetition, "id"> & Readonly<{ seasons: readonly Readonly<{ year: number; coverage: SeasonCoverage }>[] }>;
type CompetitionCatalog = Omit<Pick<Awaited<ReturnType<CompetitionsReader>>, "data" | "status" | "error" | "requestsDispatched">, "data"> &
  Readonly<{ data: readonly ArchiveCompetition[] }>;

/** Some leagues list the same selector year more than once. Archive that year once, retaining the broadest reported coverage. */
export function normalizeHistoryCompetition(row: unknown, context: NormalizationContext): ArchiveCompetition | null {
  const normalized = normalizeCompetition(row, context);
  if (normalized.valid) return normalized.data;
  if (!row || typeof row !== "object" || !("seasons" in row) || !Array.isArray(row.seasons) || row.seasons.length > 200) return null;

  let id: number | null = null;
  const seasons = new Map<number, SeasonCoverage>();
  for (const season of row.seasons) {
    const single = normalizeCompetition({ ...row, seasons: [season] }, context);
    if (!single.valid) continue;
    id = single.data.id;
    const { year, coverage } = single.data.seasons[0]!;
    const previous = seasons.get(year);
    if (!previous) { seasons.set(year, coverage); continue; }
    seasons.set(year, Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key,
      value === true || previous[key] === true ? true : value === false && previous[key] === false ? false : null,
    ])));
  }
  return id === null ? null : { id, seasons: [...seasons].map(([year, coverage]) => ({ year, coverage })) };
}

function historicalImportId({ competitionId, season, round }: FixtureScope, attempt: number, expandedLimit?: number): string {
  const key = round === undefined ? `goal-hint:historical-results:v1:${competitionId}:${season}:${attempt}`
    : `goal-hint:historical-results:round:v1:${JSON.stringify([competitionId, season, round, attempt])}`;
  const bytes = createHash("sha256").update(expandedLimit === undefined ? key : `${key}:row-limit:${expandedLimit}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fixtureSelector({ competitionId, season, round }: FixtureScope): FixtureSelector {
  return { league: String(competitionId), season: String(season), timezone: "Africa/Kampala", ...(round === undefined ? {} : { round }) };
}

const requiresPartition = (reasons: readonly string[]) => reasons.includes("response-too-large") || reasons.includes("pagination-incomplete");

function orderedRounds(rows: readonly ApiFootballFixtureRound[]): readonly string[] {
  const dates = new Map<string, string>();
  for (const { round, dates: roundDates } of rows) {
    const last = roundDates.reduce<string>((latest, date) => date > latest ? date : latest, dates.get(round) ?? "");
    dates.set(round, last);
  }
  return [...dates].sort(([left, leftDate], [right, rightDate]) =>
    rightDate.localeCompare(leftDate) || left.localeCompare(right, "en", { numeric: true })).map(([round]) => round);
}

function verifiedRoundObservation(response: ApiFootballResult<ApiFootballFixtureRound>, scope: LeagueSeason, started: UtcInstant, finished: UtcInstant) {
  const [page] = response.provenance, expected = apiFootballFixtureRoundParameters(scope);
  if (response.status !== "complete" || response.error !== null || !response.completeness.complete || response.completeness.invalidRows !== 0 ||
    response.requestsDispatched !== 1 || response.provenance.length !== 1 || !page || page.endpoint !== "fixtureRounds" ||
    page.provider !== "api-football" || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || page.fromCache ||
    page.quota.kind !== "success" || page.currentPage !== 1 || page.totalPages !== 1 ||
    page.retrievedAt < started || page.retrievedAt > finished || Object.keys(page.requestParameters).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => page.requestParameters[key] !== value)) return null;
  return page;
}

function bounds(now: UtcInstant, providerDayEndsAt: number): ApiFootballBounds {
  return { priority: "enrichment", deadlineAt: utcInstantFromEpochMilliseconds(Math.min(providerDayEndsAt, now + 45_000)),
    timeoutMs: 30_000, maxRequests: 1, maxPages: 1, maxRows: footballHistorySourceMaxRows, maxResponseBytes: 24_000_000,
    retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 2500 }, cacheMaxAgeMs: 0 };
}

/** Whole seasons are preferred. Oversized scopes resume from their independently verified round receipts. */
export function createFootballHistoryBackfill(options: Readonly<{
  competitions(query: Parameters<CompetitionsReader>[0], requestBounds: ApiFootballBounds): Promise<CompetitionCatalog>;
  store: Pick<FootballCatalogStore, "findImport"> & Partial<Pick<FootballCatalogStore, "hasReplayedImport">>;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  competitionIds: readonly number[];
  upcomingSeasons?(): Promise<readonly (LeagueSeason & Readonly<{ fixtures: number }>)[]>;
  hasFixtureSource?(parameters: FixtureSelector, observation?: FixtureSourceObservation): Promise<boolean>;
  hasExactFixtureScope?(parameters: FixtureSelector, observation: FixtureSourceObservation): Promise<boolean>;
  rounds?: Readonly<{
    read(scope: LeagueSeason): Promise<readonly ApiFootballFixtureRound[] | null>;
    fetch(scope: LeagueSeason, requestBounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow): Promise<ApiFootballResult<ApiFootballFixtureRound>>;
    save(scope: LeagueSeason, rows: readonly ApiFootballFixtureRound[], retrievedAt: UtcInstant): Promise<unknown>;
  }>;
  recordCoverage?(season: LeagueSeason, coverage: SeasonCoverage): Promise<void>;
  retentionEvidenceRef: string;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
}>) {
  const approved = new Set(options.competitionIds);

  async function hasSource(scope: FixtureScope, receipt: Readonly<{ observedAt: number; receivedCount: number }>) {
    if (!options.hasFixtureSource) return scope.round === undefined;
    return options.hasFixtureSource(fixtureSelector(scope), { retrievedAt: receipt.observedAt, rowCount: receipt.receivedCount });
  }

  async function verifiedArchive(scope: FixtureScope, observation: FixtureSourceObservation) {
    return options.hasExactFixtureScope?.(fixtureSelector(scope), observation).catch(() => false) ?? false;
  }

  async function archivedWithoutCanonicalResults(scope: FixtureScope, receipt: Readonly<{
    status: string; observedAt: number; receivedCount: number; requestsDispatched: number; reasons: readonly string[]; rawArchived?: boolean;
  }>) {
    if (receipt.status === "complete" || receipt.requestsDispatched !== 1 || receipt.receivedCount === 0) return null;
    const persistence = receipt.reasons.includes(catalogPersistenceUnavailable);
    const rowConflicts = receipt.reasons.includes("schema-error") && receipt.reasons.every((reason) =>
      ["schema-error", "invalid-rows", "retrieval-incomplete"].includes(reason));
    if (!(persistence || rowConflicts)) return null;
    if (receipt.rawArchived !== true && !await verifiedArchive(scope, { retrievedAt: receipt.observedAt, rowCount: receipt.receivedCount })) return null;
    return persistence ? "persistence" as const : "normalization" as const;
  }

  async function progress(scope: FixtureScope) {
    let oversized = false, reachedPreviousLimit = false, expanded = false;
    for (let attempt = 1; ; attempt++) {
      const id = historicalImportId(scope, attempt, expanded ? footballHistorySourceMaxRows : undefined);
      const receipt = await options.store.findImport(id);
      if (!receipt) {
        if (!expanded && reachedPreviousLimit && !oversized) {
          // The old local limit did not prove the provider could not return the whole season.
          expanded = true;
          reachedPreviousLimit = false;
          attempt = 0;
          continue;
        }
        return { id, complete: false, archivedOnly: null, oversized, coolingDown: false };
      }
      if (receipt.status === "complete" && await hasSource(scope, receipt)) return { id, complete: true, archivedOnly: null, oversized,
        coolingDown: false, empty: receipt.receivedCount === 0 };
      const reviewed = reviewedHistoryFixtureRepair(id);
      if ((reviewed || receipt.reasons.includes(catalogPersistenceUnavailable)) && await options.store.hasReplayedImport?.(id)) {
        const archived = reviewed
          ? await verifiedArchive(scope, { retrievedAt: receipt.observedAt, rowCount: receipt.receivedCount, pageId: reviewed.pageId })
          : await hasSource(scope, receipt);
        if (archived) return { id, complete: true, archivedOnly: null, oversized, coolingDown: false };
      }
      const archivedOnly = await archivedWithoutCanonicalResults(scope, receipt);
      if (archivedOnly) return { id, complete: false, archivedOnly, oversized, coolingDown: false };
      if (!expanded && scope.round === undefined && receipt.requestsDispatched === 1 && receipt.receivedCount === previousWholeSeasonRowLimit &&
        receipt.reasons.includes("pagination-incomplete") && !receipt.reasons.includes("response-too-large")) {
        reachedPreviousLimit = true;
      } else oversized ||= requiresPartition(receipt.reasons);
      if (!oversized && !reachedPreviousLimit && receipt.status !== "complete" && options.now() - receipt.recordedAt < retryDelayMs) {
        return { id, complete: false, archivedOnly: null, oversized, coolingDown: true };
      }
    }
  }

  return async function run(input: Readonly<{ maxRequests: number; competitionId?: number; oldestSeason?: number }>,
    onImport?: (result: HistoricalImport) => void, signal?: AbortSignal) {
    const currentYear = Number(getReportingDate(options.now()).slice(0, 4));
    const minSeason = input.oldestSeason ?? 1000;
    if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 2 || input.maxRequests > historyBackfillLimits.maximumRequests ||
        !Number.isSafeInteger(minSeason) || minSeason < 1000 || minSeason > currentYear ||
        (input.competitionId === undefined ? approved.size === 0 : !approved.has(input.competitionId))) {
      throw new RangeError("Choose an approved competition, a valid oldest season, and a request limit between 2 and 100.");
    }
    const scoped = input.competitionId === undefined ? approved : new Set([input.competitionId]);
    const dayEnd = options.providerDayEndsAt();
    if (dayEnd === null || options.now() >= dayEnd || signal?.aborted) throw new Error("The historical import needs a verified provider day.");
    const metadata = await options.competitions(input.competitionId === undefined ? {} : { competitionId: input.competitionId },
      bounds(options.now(), dayEnd));
    let requests = metadata.requestsDispatched;
    if (metadata.status === "failed") return { status: "catalog-unavailable" as const, reason: metadata.error?.reason ?? null, requests };

    const upcoming = await options.upcomingSeasons?.() ?? [];
    const activeSeasons = new Set(upcoming.map(({ competitionId, season }) => `${competitionId}:${season}`));
    const weights = new Map<number, number>();
    for (const { competitionId, fixtures } of upcoming) weights.set(competitionId, (weights.get(competitionId) ?? 0) + fixtures);
    const weight = (competitionId: number) => weights.get(competitionId) ?? 0;
    const known = new Set<number>(), seasons = new Map<string, Readonly<{ scope: LeagueSeason; coverage: SeasonCoverage }>>();
    for (const league of metadata.data) {
      if (!scoped.has(league.id) || !league.seasons.length) continue;
      known.add(league.id);
      for (const season of league.seasons) {
        const key = `${league.id}:${season.year}`;
        if (season.year >= minSeason && (season.year <= currentYear || activeSeasons.has(key))) {
          seasons.set(key, { scope: { competitionId: league.id, season: season.year }, coverage: season.coverage ?? {} });
        }
      }
    }
    const plan = [...seasons.values()].sort((left, right) => right.scope.season - left.scope.season ||
      weight(right.scope.competitionId) - weight(left.scope.competitionId) || left.scope.competitionId - right.scope.competitionId);
    const verifiedDayEnd = dayEnd;
    let completed = 0, imported = 0, deferred = 0, processed = 0, partitioned = 0, roundsPlanned = 0, roundsCompleted = 0;
    let archivedOnly = 0, roundsArchivedOnly = 0;
    let persistenceDeferred = 0, roundsPersistenceDeferred = 0;
    let consecutiveTransportErrors = 0;
    let stopped: string | null = null, verifiedEmpty = 0;
    function canContinue() {
      if (signal?.aborted) stopped = "interrupted";
      else if (options.providerDayEndsAt() !== verifiedDayEnd || options.now() >= verifiedDayEnd) stopped = "provider-day-ended";
      return stopped === null;
    }
    function canDispatch() {
      if (!canContinue()) return false;
      if (requests >= input.maxRequests) { stopped = "request-budget"; return false; }
      return true;
    }
    function recordTransport(dispatched: number, failed: boolean, retrieved: boolean) {
      if (dispatched === 0) return;
      if (failed) {
        consecutiveTransportErrors++;
        if (consecutiveTransportErrors >= consecutiveTransportLimit) stopped ??= "provider-transport-unavailable";
      } else if (retrieved) consecutiveTransportErrors = 0;
    }
    async function importScope(scope: FixtureScope, id: string) {
      const result = await options.importer.import({ id, selection: { kind: "fixtures", query: scope },
        bounds: bounds(options.now(), verifiedDayEnd), retentionEvidenceRef: options.retentionEvidenceRef },
      (observation) => verifiedArchive(scope, observation)).catch((error: unknown) => {
        if (!(error instanceof CatalogPersistenceDeferredError)) throw error;
        return { status: "deferred" as const, observedAt: error.observedAt, receivedCount: error.receivedCount,
          requestsDispatched: error.requestsDispatched, importedCount: 0, reasons: error.reasons, rawArchived: error.rawArchived };
      });
      requests += result.requestsDispatched;
      processed++;
      imported += result.importedCount;
      const pendingPersistence = result.reasons.includes(catalogPersistenceUnavailable);
      if (pendingPersistence) {
        if (scope.round === undefined) persistenceDeferred++;
        else roundsPersistenceDeferred++;
      }
      onImport?.({ ...scope, status: pendingPersistence ? "deferred" : result.status, received: result.receivedCount, imported: result.importedCount,
        requests: result.requestsDispatched, reasons: result.reasons });
      stopped = result.reasons.find((reason) => stopReasons.has(reason)) ?? null;
      recordTransport(result.requestsDispatched, result.reasons.some((reason) => transportFailures.has(reason)),
        result.status === "complete" || result.status === "partial" || result.status === "degraded" || "rawArchived" in result && result.rawArchived);
      return result;
    }

    for (const { scope: item, coverage } of plan) {
      if (!canContinue()) break;
      const whole = await progress(item);
      if (whole.complete) { completed++; verifiedEmpty += Number(whole.empty === true); continue; }
      if (whole.archivedOnly) {
        archivedOnly++; deferred++;
        if (whole.archivedOnly === "persistence") persistenceDeferred++;
        continue;
      }
      if (whole.coolingDown) { deferred++; continue; }
      let oversized = whole.oversized;
      if (!oversized) {
        if (!canDispatch()) break;
        const result = await importScope(item, whole.id);
        if (!result.reasons.includes(catalogPersistenceUnavailable) && Object.values(coverage).some((value) => typeof value === "boolean")) {
          await options.recordCoverage?.(item, coverage);
        }
        if (result.status === "complete" && await hasSource(item, result)) { completed++; verifiedEmpty += Number(result.receivedCount === 0); continue; }
        if (await archivedWithoutCanonicalResults(item, result)) { archivedOnly++; deferred++; continue; }
        oversized = requiresPartition(result.reasons);
      }
      deferred++;
      if (stopped) break;
      if (!oversized || !options.rounds || !options.hasFixtureSource) continue;
      let roundRows = await options.rounds.read(item);
      if (roundRows === null) {
        if (!canDispatch()) break;
        const started = options.now(), requestBounds = bounds(started, verifiedDayEnd);
        const check = () => {
          if (signal?.aborted || options.providerDayEndsAt() !== verifiedDayEnd || options.now() >= requestBounds.deadlineAt) {
            throw new Error("The historical round request expired.");
          }
        };
        const response = await options.rounds.fetch(item, requestBounds, { signal: signal ?? new AbortController().signal,
          deadlineAt: requestBounds.deadlineAt, check, beforeReserve: check, beforeDispatch: check });
        requests += response.requestsDispatched;
        if (!canContinue()) break;
        if (response.error && stopReasons.has(response.error.reason)) { stopped = response.error.reason; break; }
        const observation = verifiedRoundObservation(response, item, started, options.now());
        recordTransport(response.requestsDispatched, response.error !== null && transportFailures.has(response.error.reason), observation !== null);
        if (stopped) break;
        if (!observation) continue;
        roundRows = response.data;
        await options.rounds.save(item, roundRows, observation.retrievedAt);
      }
      const rounds = orderedRounds(roundRows);
      roundsPlanned += rounds.length;
      let verified = 0;
      for (const round of rounds) {
        if (!canContinue()) break;
        const scope = { ...item, round };
        const previous = await progress(scope);
        if (previous.complete) { verified++; continue; }
        if (previous.archivedOnly) {
          roundsArchivedOnly++;
          if (previous.archivedOnly === "persistence") roundsPersistenceDeferred++;
          continue;
        }
        if (previous.coolingDown || previous.oversized) continue;
        if (!canDispatch()) break;
        const result = await importScope(scope, previous.id);
        if (result.status === "complete" && await hasSource(scope, result)) verified++;
        else if (await archivedWithoutCanonicalResults(scope, result)) roundsArchivedOnly++;
        if (stopped) break;
      }
      roundsCompleted += verified;
      // A round catalog cannot establish a season-wide total or rule out unlabelled fixtures.
      if (rounds.length > 0 && verified === rounds.length) partitioned++;
      if (stopped) break;
    }

    const unlistedCompetitions = [...scoped].filter((competitionId) => !known.has(competitionId)).sort((left, right) => left - right);
    const complete = !stopped && deferred === 0 && unlistedCompetitions.length === 0;
    return { status: complete ? "complete" as const : "partial" as const,
      requests, planned: plan.length, completed, verifiedEmpty, archivedOnly, deferred, processed, imported, partitioned, roundsPlanned, roundsCompleted,
      ...(complete && { fixtureScopeFingerprint: footballHistoryFixtureScopeFingerprint(plan.map(({ scope }) => scope)) }),
      providerDayEndsAt: verifiedDayEnd,
      roundsArchivedOnly, persistenceDeferred, roundsPersistenceDeferred, consecutiveTransportErrors, unlistedCompetitions, stopped };
  };
}
