import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballReferenceParameters, isApiFootballLeaderboard, isFootballHistoryReferenceDictionary,
  type ApiFootballErrorReason, type FootballHistoryReferenceTarget } from "./api-football-contract.ts";
import { historyBackfillLimits } from "./history-backfill.ts";
import { isFootballHistoryPersonRecordEndpoint } from "./history-person-records.ts";

export type { FootballHistoryReferenceTarget } from "./api-football-contract.ts";

export type FootballHistoryReferenceSelector = Readonly<{
  endpoint: FootballHistoryReferenceTarget["endpoint"];
  parameters: Readonly<Record<string, string>>;
}>;

type ReferenceAdapter = ReturnType<typeof createApiFootballAdapter>["reference"];
type ReferenceResponse = Awaited<ReturnType<ReferenceAdapter["page"]>>;
type ReferencePage = FootballHistoryReferenceSelector & Readonly<{ rows: readonly unknown[]; retrievedAt: UtcInstant }>;

const stopReasons = new Set<ApiFootballErrorReason>(["quota-denied", "rate-limited", "operation-not-authorized",
  "authentication-error", "invalid-credential", "subscription-expired", "shared-work-pending"]);

function priority({ endpoint }: FootballHistoryReferenceTarget) {
  if (isFootballHistoryReferenceDictionary(endpoint)) return 2;
  return endpoint === "teamStatistics" || endpoint === "coaches" || endpoint === "squads" || endpoint === "teamSeasons" ||
    endpoint === "fixtureRounds" || endpoint === "fixtureHalfStatistics" || isApiFootballLeaderboard(endpoint) ||
    isFootballHistoryPersonRecordEndpoint(endpoint) ? 0 : 1;
}

function acceptedPage(response: ReferenceResponse, selector: FootballHistoryReferenceSelector,
  started: UtcInstant, finished: UtcInstant, deadlineAt: UtcInstant) {
  const [page] = response.provenance;
  if (response.status !== "complete" || response.error !== null || !response.completeness.complete || response.completeness.invalidRows !== 0 ||
    response.completeness.reasons.length !== 0 || response.completeness.missingIds.length !== 0 ||
    response.requestsDispatched !== 1 || response.provenance.length !== 1 || !page ||
    page.provider !== "api-football" || page.endpoint !== selector.endpoint || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
    page.fromCache || page.quota.kind !== "success" || page.currentPage !== 1 || page.totalPages !== 1 ||
    !Number.isSafeInteger(page.retrievedAt) || page.retrievedAt < started || page.retrievedAt > finished || page.retrievedAt >= deadlineAt) return null;
  const parameters = Object.entries(selector.parameters);
  if (Object.keys(page.requestParameters).length !== parameters.length ||
    parameters.some(([key, value]) => page.requestParameters[key] !== value)) return null;
  if (selector.endpoint === "fixtureHalfStatistics" && response.data.length !== 0 && response.data.length !== 2) return null;
  return { ...selector, rows: response.data.map(({ raw }) => raw), retrievedAt: page.retrievedAt };
}

/** Imports scoped reference pages into the private archive using the shared provider account. */
export function createFootballHistoryReference(options: Readonly<{
  reference: ReferenceAdapter;
  hasPage(selector: FootballHistoryReferenceSelector): Promise<boolean>;
  savePage(page: ReferencePage): Promise<unknown>;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
}>) {
  const { reference, hasPage, savePage, now, providerDayEndsAt } = options;

  return {
    async run(input: Readonly<{ targets: readonly FootballHistoryReferenceTarget[]; maxRequests: number; hasMoreTargets?: boolean; signal?: AbortSignal }>) {
      const { maxRequests, targets } = input;
      if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > historyBackfillLimits.maximumRequests || !Array.isArray(targets)) {
        throw new RangeError("Choose historical reference targets and a request limit between 1 and 100.");
      }
      const plan = new Map<string, { target: FootballHistoryReferenceTarget; selector: FootballHistoryReferenceSelector }>();
      for (const target of targets) {
        const parameters = apiFootballReferenceParameters(target);
        if (!parameters) throw new RangeError("Invalid historical reference target.");
        const selector = { endpoint: target.endpoint, parameters };
        plan.set(JSON.stringify(selector), { target, selector });
      }
      const planned = [...plan.values()].sort(({ target: left }, { target: right }) => {
        const leftPriority = priority(left), rightPriority = priority(right);
        if (leftPriority !== rightPriority) return rightPriority - leftPriority;
        if (leftPriority === 0) return 0;
        return ("season" in right ? right.season : 0) - ("season" in left ? left.season : 0);
      });
      const dayEnd = providerDayEndsAt();
      if (dayEnd === null || !Number.isSafeInteger(dayEnd) || now() >= dayEnd) throw new Error("The historical reference import needs a verified provider day.");

      const signal = input.signal ?? new AbortController().signal;
      const totals = { requested: 0, archived: 0, skipped: 0, deferred: 0, requests: 0 };
      const dayStop = () => signal.aborted ? "interrupted" : providerDayEndsAt() !== dayEnd || now() >= dayEnd ? "provider-day-ended" : null;
      let stopped: string | null = null;
      let consecutiveTransportFailures = 0;
      for (const { target, selector } of planned) {
        stopped = dayStop();
        if (stopped) break;
        const archived = await hasPage(selector);
        stopped = dayStop();
        if (stopped) break;
        if (archived) { totals.skipped++; continue; }
        if (totals.requests >= maxRequests) { stopped = "request-budget"; break; }

        const started = now(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(dayEnd, started + 45_000));
        const check = () => {
          if (dayStop() || now() >= deadlineAt) throw new Error("The historical reference request expired.");
        };
        totals.requested++;
        const response = await reference.page(target, { priority: "enrichment", deadlineAt, timeoutMs: 30_000,
          maxRequests: 1, maxPages: 1, maxRows: 10_000, maxResponseBytes: 24_000_000,
          retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 2500 }, cacheMaxAgeMs: 0 },
        { signal, deadlineAt, check, beforeReserve: check, beforeDispatch: check });
        totals.requests += response.requestsDispatched;
        const page = acceptedPage(response, selector, started, now(), deadlineAt);
        if (page) {
          await savePage(page);
          totals.archived++;
          if ("subjectIds" in target && target.subjectIds.length > 1 && page.rows.length < target.subjectIds.length) totals.deferred++;
        } else totals.deferred++;

        const reason = response.error?.reason;
        stopped = dayStop() ?? (reason && stopReasons.has(reason) ? reason : null);
        if (stopped) break;
        const transportFailure = reason === "transport-error" || reason === "deadline-exceeded";
        consecutiveTransportFailures = transportFailure ? consecutiveTransportFailures + 1 : 0;
        if (consecutiveTransportFailures >= 3) { stopped = "provider-transport-unavailable"; break; }
        if (response.requestsDispatched !== 1 && !transportFailure) { stopped = reason ?? "reference-unavailable"; break; }
      }
      if (!stopped && input.hasMoreTargets) stopped = totals.requests >= maxRequests ? "request-budget" : "target-limit";
      return { status: stopped || totals.deferred ? "partial" as const : "complete" as const, ...totals, stopped };
    },
  };
}
