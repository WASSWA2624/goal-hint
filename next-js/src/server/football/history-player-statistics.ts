import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballErrorReason,
  type ApiFootballFallbackWorkflow, type ApiFootballResult } from "./api-football-contract.ts";
import { historyBackfillLimits } from "./history-backfill.ts";
import { archivedPlayerProfileRowId, archivedPlayerStatisticsRowId, playerProfilePageSize, playerStatisticsPageSize,
  playerStatisticsProviderId as providerId, positiveInteger as positive, validPlayerArchivePageSize } from "./history-player-statistics-input.ts";

export type FootballHistoryPlayerStatisticsTarget = Readonly<{ competitionId: number; season: number }>;
type ProfileTarget = Readonly<Record<never, never>>;
type PlayerPageSelector<Target> = Target & Readonly<{ page: number }>;
export type FootballHistoryPlayerStatisticsSelector = PlayerPageSelector<FootballHistoryPlayerStatisticsTarget>;
export type FootballHistoryPlayerProfileSelector = PlayerPageSelector<ProfileTarget>;
export type FootballHistoryPlayerStatisticsReceipt = Readonly<{ page: number; totalPages: number; retrievedAt: UtcInstant;
  rowCount: number; playerIds: readonly number[] }>;
type PlayerPage<Target> = Target & FootballHistoryPlayerStatisticsReceipt & Readonly<{ rows: readonly unknown[] }>;
export type FootballHistoryPlayerStatisticsPage = PlayerPage<FootballHistoryPlayerStatisticsTarget>;
export type FootballHistoryPlayerProfilePage = PlayerPage<ProfileTarget>;
type PlayerPageTransport<Target> = (selector: PlayerPageSelector<Target>,
  bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) => Promise<ApiFootballResult<Readonly<{ raw: unknown }>>>;
export type FootballHistoryPlayerStatisticsTransport = PlayerPageTransport<FootballHistoryPlayerStatisticsTarget>;
export type FootballHistoryPlayerProfileTransport = PlayerPageTransport<ProfileTarget>;

type PageDeferral = ApiFootballErrorReason | "unverified-page" | "page-count-changed" | "duplicate-player";
type PageReport<Target> = PlayerPageSelector<Target> & Readonly<{ status: "archived" | "deferred";
  totalPages: number | null; rowCount: number; requests: number; reason: PageDeferral | null }>;
type PageRules<Target> = Readonly<{ endpoint: "playerStatistics" | "playerProfiles"; pageSize: number;
  parameters(selector: PlayerPageSelector<Target>): Readonly<Record<string, string>>;
  rowId(row: unknown, target: Target): number | null }>;
type ArchiveOptions<Target> = Readonly<{
  // Receipts must refer to durable raw pages. A null result denotes corrupted stored evidence.
  readPages(target: Target): Promise<readonly FootballHistoryPlayerStatisticsReceipt[] | null>;
  savePage(page: PlayerPage<Target>): Promise<unknown>;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
  maximumPage?: number;
}>;
type BatchInput = Readonly<{ maxRequests: number; signal?: AbortSignal }>;

const stopReasons = new Set<ApiFootballErrorReason>(["quota-denied", "rate-limited", "operation-not-authorized",
  "authentication-error", "invalid-credential", "subscription-expired", "shared-work-pending"]);

function receiptState(receipts: readonly FootballHistoryPlayerStatisticsReceipt[] | null, at: UtcInstant, pageSize: number) {
  if (!Array.isArray(receipts)) return null;
  const pages = new Set<number>(), players = new Set<number>();
  let totalPages: number | null = null, empty = false;
  for (const receipt of receipts) {
    if (!receipt || !validPlayerArchivePageSize(receipt.page, receipt.totalPages, receipt.rowCount, pageSize) || !Number.isSafeInteger(receipt.retrievedAt) ||
      receipt.retrievedAt < 0 || receipt.retrievedAt > at || totalPages !== null && totalPages !== receipt.totalPages || pages.has(receipt.page) ||
      !Array.isArray(receipt.playerIds) || receipt.playerIds.length !== receipt.rowCount) return null;
    for (const id of receipt.playerIds) {
      if (!providerId(id) || players.has(id)) return null;
      players.add(id);
    }
    pages.add(receipt.page);
    totalPages = receipt.totalPages;
    empty = receipt.rowCount === 0;
  }
  return { pages, players, totalPages, empty };
}

function acceptedPage<Target>(response: ApiFootballResult<Readonly<{ raw: unknown }>>, rules: PageRules<Target>,
  selector: PlayerPageSelector<Target>, started: UtcInstant, finished: UtcInstant, deadlineAt: UtcInstant): PlayerPage<Target> | null {
  const [page] = response.provenance;
  if (response.status !== "complete" || response.error !== null || !response.completeness.complete || response.completeness.invalidRows !== 0 ||
    response.completeness.reasons.length !== 0 || response.completeness.missingIds.length !== 0 ||
    response.requestsDispatched !== 1 || response.provenance.length !== 1 || !page || page.provider !== "api-football" ||
    page.endpoint !== rules.endpoint || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || page.fromCache || page.quota.kind !== "success" ||
    page.currentPage !== selector.page || page.totalPages === null || !validPlayerArchivePageSize(selector.page, page.totalPages, response.data.length, rules.pageSize) ||
    !Number.isSafeInteger(page.retrievedAt) || page.retrievedAt < started || page.retrievedAt > finished || page.retrievedAt >= deadlineAt) return null;
  const requested = Object.entries(rules.parameters(selector));
  if (Object.keys(page.requestParameters).length !== requested.length || requested.some(([key, value]) => page.requestParameters[key] !== value)) return null;

  const rows = response.data.map((entry) => entry?.raw), playerIds = new Set<number>();
  for (const row of rows) {
    const id = rules.rowId(row, selector);
    if (id === null || playerIds.has(id)) return null;
    playerIds.add(id);
  }
  return { ...selector, rows, playerIds: [...playerIds], totalPages: page.totalPages, retrievedAt: page.retrievedAt, rowCount: rows.length };
}

/** Each target requires a consistent receipt for every page reported by the provider. */
function playerArchive<Target>(options: ArchiveOptions<Target>, transport: PlayerPageTransport<Target>, rules: PageRules<Target>) {
  const { readPages, savePage, now, providerDayEndsAt, maximumPage } = options, { pageSize } = rules;
  if (maximumPage !== undefined && !positive(maximumPage)) throw new RangeError("Invalid player-statistics page limit.");

  return {
    async run(input: BatchInput & Readonly<{ targets: readonly Target[] }>, onPage?: (report: PageReport<Target>) => void) {
      const { targets: planned, maxRequests } = input;
      if (!positive(maxRequests) || maxRequests > historyBackfillLimits.maximumRequests) {
        throw new RangeError("Choose a player archive request limit between 1 and 100.");
      }
      const dayEnd = providerDayEndsAt();
      if (dayEnd === null || !Number.isSafeInteger(dayEnd) || now() >= dayEnd) throw new Error("The player archive needs a verified provider day.");

      const signal = input.signal ?? new AbortController().signal;
      const dayStop = () => signal.aborted ? "interrupted" : providerDayEndsAt() !== dayEnd || now() >= dayEnd ? "provider-day-ended" : null;
      const totals = { requested: 0, archived: 0, skipped: 0, deferred: 0, requests: 0, completed: 0, empty: 0, conflicts: 0, limited: 0 };
      let stopped: string | null = null;
      targetLoop: for (const target of planned) {
        stopped = dayStop();
        if (stopped) break;
        const receipts = await readPages(target);
        stopped = dayStop();
        if (stopped) break;
        const state = receiptState(receipts, now(), pageSize);
        if (!state) { totals.conflicts++; continue; }
        totals.skipped += state.pages.size;
        let { totalPages, empty } = state;
        let page = 1;
        while (totalPages === null || page <= totalPages) {
          if (state.pages.has(page)) { page++; continue; }
          if (maximumPage !== undefined && page > maximumPage) { totals.limited++; continue targetLoop; }
          stopped = dayStop();
          if (stopped) break targetLoop;
          if (totals.requests >= maxRequests) { stopped = "request-budget"; break targetLoop; }

          const started = now(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(dayEnd, started + 45_000));
          const check = () => {
            if (dayStop() || now() >= deadlineAt) throw new Error("The player archive request expired.");
          };
          const selector = { ...target, page };
          totals.requested++;
          const response = await transport(selector, { priority: "enrichment", deadlineAt, timeoutMs: 30_000,
            maxRequests: 1, maxPages: 1, maxRows: pageSize, maxResponseBytes: 4_000_000,
            retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 2500 }, cacheMaxAgeMs: 0 },
          { signal, deadlineAt, check, beforeReserve: check, beforeDispatch: check });
          const requests = response.requestsDispatched;
          if (requests !== 0 && requests !== 1) throw new Error("Invalid player archive transport request count.");
          totals.requests += requests;
          const observed = acceptedPage(response, rules, selector, started, now(), deadlineAt);
          let reason: PageDeferral | null = null;
          if (!observed) reason = response.error?.reason ?? "unverified-page";
          else if (totalPages !== null && observed.totalPages !== totalPages) reason = "page-count-changed";
          else if (observed.playerIds.some((id) => state.players.has(id))) reason = "duplicate-player";

          if (reason) {
            totals.deferred++;
            if (reason === "page-count-changed" || reason === "duplicate-player") totals.conflicts++;
            onPage?.({ ...selector, status: "deferred", totalPages: observed?.totalPages ?? totalPages,
              rowCount: 0, requests, reason });
            stopped = dayStop() ?? (response.error && stopReasons.has(response.error.reason) ? response.error.reason : null);
            if (stopped || requests === 0) { stopped ??= reason; break targetLoop; }
            continue targetLoop;
          }
          if (!observed) throw new Error("Missing validated player archive page.");
          await savePage(observed);
          totals.archived++;
          totalPages = observed.totalPages;
          empty = observed.rowCount === 0;
          for (const id of observed.playerIds) state.players.add(id);
          onPage?.({ ...selector, status: "archived", totalPages, rowCount: observed.rowCount, requests, reason: null });
          page++;
        }
        totals.completed++;
        totals.empty += Number(empty);
      }
      stopped ??= dayStop();
      const remaining = planned.length - totals.completed;
      return { status: stopped || remaining ? "partial" as const : "complete" as const,
        planned: planned.length, remaining, ...totals, stopped };
    },
  };
}

export function createFootballHistoryPlayerStatistics(options: ArchiveOptions<FootballHistoryPlayerStatisticsTarget> &
  Readonly<{ playerStatisticsPage: FootballHistoryPlayerStatisticsTransport }>) {
  const archive = playerArchive(options, options.playerStatisticsPage, { endpoint: "playerStatistics", pageSize: playerStatisticsPageSize,
    parameters: ({ competitionId, season, page }) => ({ league: String(competitionId), season: String(season), page: String(page) }),
    rowId: archivedPlayerStatisticsRowId });
  return {
    run(input: BatchInput & Readonly<{ targets: readonly FootballHistoryPlayerStatisticsTarget[] }>, onPage?: (report: PageReport<FootballHistoryPlayerStatisticsTarget>) => void) {
      if (!Array.isArray(input.targets)) throw new RangeError("Choose player-statistics targets.");
      const unique = new Map<string, FootballHistoryPlayerStatisticsTarget>();
      for (const target of input.targets) {
        if (!target || !providerId(target.competitionId) || !Number.isInteger(target.season) || target.season < 1000 || target.season > 9999) {
          throw new RangeError("Invalid player-statistics league or season.");
        }
        unique.set(`${target.competitionId}:${target.season}`, { competitionId: target.competitionId, season: target.season });
      }
      return archive.run({ ...input, targets: [...unique.values()].sort((left, right) => right.season - left.season) }, onPage);
    },
  };
}

export function createFootballHistoryPlayerProfiles(options: ArchiveOptions<ProfileTarget> & Readonly<{ playerProfilePage: FootballHistoryPlayerProfileTransport }>) {
  const archive = playerArchive(options, options.playerProfilePage, { endpoint: "playerProfiles", pageSize: playerProfilePageSize,
    parameters: ({ page }) => ({ page: String(page) }), rowId: archivedPlayerProfileRowId });
  return {
    run(input: BatchInput, onPage?: (report: PageReport<ProfileTarget>) => void) { return archive.run({ ...input, targets: [{}] }, onPage); },
  };
}
