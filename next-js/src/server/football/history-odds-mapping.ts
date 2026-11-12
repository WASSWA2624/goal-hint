import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints, type ApiFootballBounds,
  type ApiFootballFallbackWorkflow, type ApiFootballResult } from "./api-football-contract.ts";

const pageSize = apiFootballEndpoints.oddsMapping.pageSize;
const providerId = z.number().int().positive().max(4_294_967_295);
const season = z.number().int().min(1000).max(9999);
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
const rowSchema = z.strictObject({ id: providerId, competitionId: providerId, season, kickoffAt: time, updatedAt: time });
const providerRow = z.object({ league: z.object({ id: providerId, season }), fixture: z.object({
  id: providerId, date: z.iso.datetime({ offset: true }), timestamp: z.number().int().nonnegative(),
}), update: z.iso.datetime({ offset: true }) });
const pageSchema = z.strictObject({ page: z.number().int().positive(), totalPages: z.number().int().positive(), retrievedAt: time,
  rows: z.array(rowSchema).max(pageSize) });
export type FootballHistoryOddsMapping = Readonly<z.infer<typeof rowSchema>>;
export type FootballHistoryOddsMappingPage = Readonly<Omit<z.infer<typeof pageSchema>, "rows"> & {
  rows: readonly FootballHistoryOddsMapping[];
}>;
type Transport = (page: number, bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) =>
  Promise<ApiFootballResult<FootballHistoryOddsMapping>>;

function dayAt(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

/** Keep the provider fixture and league identities and the two observation times. */
export function normalizeFootballHistoryOddsMapping(value: unknown, retrievedAt: number): FootballHistoryOddsMapping | null {
  const parsed = providerRow.safeParse(value);
  if (!parsed.success) return null;
  const { fixture, league, update } = parsed.data;
  const kickoffAt = Date.parse(fixture.date), updatedAt = Date.parse(update);
  if (kickoffAt !== fixture.timestamp * 1_000 || updatedAt > retrievedAt) return null;
  const normalized = rowSchema.safeParse({ id: fixture.id, competitionId: league.id, season: league.season, kickoffAt, updatedAt });
  return normalized.success ? normalized.data : null;
}

export function parseFootballHistoryOddsMappingPage(value: unknown, day: string): FootballHistoryOddsMappingPage | null {
  const result = pageSchema.safeParse(value);
  if (!result.success) return null;
  const { page, totalPages, rows, retrievedAt } = result.data;
  if (dayAt(retrievedAt) !== day || page > totalPages || (page < totalPages && rows.length !== pageSize) ||
    (rows.length === 0 && totalPages !== 1) || new Set(rows.map(({ id }) => id)).size !== rows.length ||
    rows.some(({ updatedAt }) => updatedAt > retrievedAt)) return null;
  return result.data;
}

function acceptedPage(response: ApiFootballResult<FootballHistoryOddsMapping>, day: string, page: number,
  started: UtcInstant, finished: UtcInstant) {
  const [source] = response.provenance;
  if (response.status !== "complete" || response.error !== null || !response.completeness.complete ||
    response.completeness.invalidRows !== 0 || response.requestsDispatched !== 1 || response.provenance.length !== 1 ||
    !source || source.provider !== "api-football" || source.endpoint !== "oddsMapping" || source.fromCache ||
    source.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || source.quota.kind !== "success" ||
    Object.keys(source.requestParameters).length !== 1 || source.requestParameters.page !== String(page) ||
    source.currentPage !== page || source.retrievedAt < started || source.retrievedAt > finished) return null;
  return parseFootballHistoryOddsMappingPage({ page, totalPages: source.totalPages,
    retrievedAt: source.retrievedAt, rows: response.data }, day);
}

export function createFootballHistoryOddsMapping(options: Readonly<{
  mappingPage: Transport;
  readPages(day: string): Promise<readonly FootballHistoryOddsMappingPage[] | null>;
  savePage(day: string, page: FootballHistoryOddsMappingPage): Promise<unknown>;
  authorized(): boolean;
  canDispatch(): Promise<boolean>;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
}>) {
  const { now, providerDayEndsAt } = options;
  return {
    async run(maxRequests: number, signal = new AbortController().signal) {
      if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 100) throw new RangeError("Invalid odds mapping request limit.");
      const dayEnd = providerDayEndsAt(), day = dayAt(now());
      const totals = { requested: 0, archived: 0, skipped: 0, deferred: 0, requests: 0 };
      const seen = new Set<number>(), pages = new Set<number>();
      let totalPages: number | null = null;
      const report = (stopped: string | null) => ({ status: stopped ? "partial" as const : "complete" as const,
        day, totalPages, pagesVerified: pages.size, fixturesVerified: seen.size, ...totals, stopped });
      const currentStop = () => signal.aborted ? "interrupted" : dayEnd === null || providerDayEndsAt() !== dayEnd ||
        now() >= dayEnd || dayAt(now()) !== day ? "provider-day-ended" : !options.authorized() ? "operation-not-authorized" : null;
      const initialStop = currentStop();
      if (initialStop || dayEnd === null) return report(initialStop ?? "provider-day-ended");
      const archived = await options.readPages(day);
      const afterRead = currentStop();
      if (afterRead) return report(afterRead);
      const checkedAt = now();
      if (!archived || archived.some(({ retrievedAt }) => retrievedAt > checkedAt)) return report("odds-mapping-archive-invalid");
      const add = ({ page, totalPages: observed, rows }: FootballHistoryOddsMappingPage) => {
        if (pages.has(page) || totalPages !== null && totalPages !== observed || rows.some(({ id }) => seen.has(id))) return false;
        pages.add(page);
        totalPages = observed;
        for (const { id } of rows) seen.add(id);
        return true;
      };
      for (const page of archived) {
        if (!add(page)) return report("pagination-incomplete");
        totals.skipped++;
      }
      for (let page = 1; totalPages === null || page <= totalPages; page++) {
        if (pages.has(page)) continue;
        const stopped = currentStop();
        if (stopped) return report(stopped);
        if (totals.requests >= maxRequests) return report("request-budget");
        if (!await options.canDispatch()) return report("odds-mapping-quota-unavailable");
        const started = now(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(started + 45_000, dayEnd));
        const check = () => {
          if (currentStop() || now() >= deadlineAt) throw new Error("The odds mapping request expired.");
        };
        const before = currentStop();
        if (before) return report(before);
        totals.requested++;
        const response = await options.mappingPage(page, { priority: "enrichment", deadlineAt, timeoutMs: 30_000, maxRequests: 1,
          maxPages: 1, maxRows: pageSize, maxResponseBytes: 512_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
          cacheMaxAgeMs: 0 }, { signal, deadlineAt, check, beforeReserve: check, beforeDispatch: check });
        totals.requests += response.requestsDispatched;
        const finished = now();
        const validated = acceptedPage(response, day, page, started, finished);
        const after = currentStop();
        if (after || !validated) {
          totals.deferred++;
          return report(after ?? response.error?.reason ?? "pagination-incomplete");
        }
        // Keep a valid conflicting observation so a changed page set cannot
        // be mistaken for complete or repeatedly requested on this UTC day.
        await options.savePage(day, validated);
        totals.archived++;
        if (!add(validated)) {
          totals.deferred++;
          return report("pagination-incomplete");
        }
      }
      return report(currentStop());
    },
  };
}
