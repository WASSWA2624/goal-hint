import "server-only";

import { createHash } from "node:crypto";
import { getReportingDate, utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import type { ApiFootballBounds } from "./api-football-contract.ts";
import { normalizeCompetition, type NormalizationContext, type NormalizedCompetition } from "./api-football-normalize.ts";
import type { FootballCatalogStore } from "./catalog-mysql-store.ts";
import type { createFootballCatalogImporter } from "./catalog-service.ts";

export const historyBackfillLimits = Object.freeze({ defaultRequests: 6, maximumRequests: 100 });
const retryDelayMs = 15 * 60_000;
const stopReasons = new Set(["quota-denied", "rate-limited", "operation-not-authorized", "authentication-error",
  "invalid-credential", "subscription-expired"]);

type LeagueSeason = Readonly<{ competitionId: number; season: number }>;
type SeasonCoverage = Readonly<Record<string, boolean | null>>;
type HistoricalImport = Readonly<{ competitionId: number; season: number; status: string;
  received: number; imported: number; requests: number; reasons: readonly string[] }>;
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

function historicalImportId({ competitionId, season }: LeagueSeason, attempt: number): string {
  const bytes = createHash("sha256").update(`goal-hint:historical-results:v1:${competitionId}:${season}:${attempt}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bounds(now: UtcInstant, providerDayEndsAt: number): ApiFootballBounds {
  return { priority: "enrichment", deadlineAt: utcInstantFromEpochMilliseconds(Math.min(providerDayEndsAt, now + 45_000)),
    timeoutMs: 30_000, maxRequests: 1, maxPages: 1, maxRows: 5_000, maxResponseBytes: 24_000_000,
    retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 2500 }, cacheMaxAgeMs: 0 };
}

/** One counted catalog read, then one bounded request per league season. Completed import receipts travel with the database. */
export function createFootballHistoryBackfill(options: Readonly<{
  competitions(query: Parameters<CompetitionsReader>[0], requestBounds: ApiFootballBounds): Promise<CompetitionCatalog>;
  store: Pick<FootballCatalogStore, "findImport">;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  competitionIds: readonly number[];
  upcomingSeasons?(): Promise<readonly (LeagueSeason & Readonly<{ fixtures: number }>)[]>;
  hasFixtureSource?(parameters: Readonly<{ league: string; season: string; timezone: string }>): Promise<boolean>;
  recordCoverage?(season: LeagueSeason, coverage: SeasonCoverage): Promise<void>;
  retentionEvidenceRef: string;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
}>) {
  const approved = new Set(options.competitionIds);

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
    let completed = 0, imported = 0, deferred = 0, processed = 0;
    let stopped: string | null = null;
    for (const { scope: item, coverage } of plan) {
      if (signal?.aborted) { stopped = "interrupted"; break; }
      const nextDayEnd = options.providerDayEndsAt();
      if (nextDayEnd !== dayEnd || options.now() >= dayEnd) { stopped = "provider-day-ended"; break; }
      let attempt = 1, id = historicalImportId(item, attempt);
      let receipt = await options.store.findImport(id), coolingDown = false, hasSource = false;
      while (receipt) {
        if (receipt.status === "complete") {
          hasSource = !options.hasFixtureSource || await options.hasFixtureSource({ league: String(item.competitionId),
            season: String(item.season), timezone: "Africa/Kampala" });
          if (hasSource) break;
        } else if (options.now() - receipt.recordedAt < retryDelayMs) { coolingDown = true; break; }
        id = historicalImportId(item, ++attempt);
        receipt = await options.store.findImport(id);
      }
      if (hasSource) { completed++; continue; }
      if (coolingDown) { deferred++; continue; }
      if (requests >= input.maxRequests) { stopped = "request-budget"; break; }
      if (signal?.aborted) { stopped = "interrupted"; break; }
      if (options.now() >= dayEnd) { stopped = "provider-day-ended"; break; }
      const result = await options.importer.import({ id, selection: { kind: "fixtures", query: item },
        bounds: bounds(options.now(), dayEnd), retentionEvidenceRef: options.retentionEvidenceRef });
      if (Object.values(coverage).some((value) => typeof value === "boolean")) await options.recordCoverage?.(item, coverage);
      requests += result.requestsDispatched;
      processed++;
      imported += result.importedCount;
      if (result.status === "complete") completed++; else deferred++;
      onImport?.({ ...item, status: result.status, received: result.receivedCount,
        imported: result.importedCount, requests: result.requestsDispatched, reasons: result.reasons });
      const stopReason = result.reasons.find((reason) => stopReasons.has(reason));
      if (stopReason !== undefined) { stopped = stopReason; break; }
    }

    const unlistedCompetitions = [...scoped].filter((competitionId) => !known.has(competitionId)).sort((left, right) => left - right);
    return { status: stopped || deferred || unlistedCompetitions.length ? "partial" as const : "complete" as const,
      requests, planned: plan.length, completed, deferred, processed, imported, unlistedCompetitions, stopped };
  };
}
