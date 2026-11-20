import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballReferenceParameters, isApiFootballLeaderboard, isFootballHistoryReferenceDictionary,
  type ApiFootballErrorReason, type ApiFootballFailure, type FootballHistoryReferenceTarget } from "./api-football-contract.ts";
import { historyBackfillLimits } from "./history-backfill.ts";
import { isFootballHistoryPersonRecordEndpoint } from "./history-person-records.ts";
import { footballHistoryReferencePhases, type FootballHistoryReferencePhase } from "./history-source.ts";

export type { FootballHistoryReferenceTarget } from "./api-football-contract.ts";

export type FootballHistoryReferenceSelector = Readonly<{
  endpoint: FootballHistoryReferenceTarget["endpoint"];
  parameters: Readonly<Record<string, string>>;
}>;

type ReferenceAdapter = ReturnType<typeof createApiFootballAdapter>["reference"];
type ReferenceResponse = Awaited<ReturnType<ReferenceAdapter["page"]>>;
export type FootballHistoryReferencePage = FootballHistoryReferenceSelector & Readonly<{ rows: readonly unknown[]; retrievedAt: UtcInstant }>;
export type FootballHistoryReferenceCheckpoint = Readonly<{
  begin(selector: FootballHistoryReferenceSelector): Promise<Readonly<{
    save(page: FootballHistoryReferencePage, remaining: number): Promise<boolean>;
    fail(error: ApiFootballFailure | null): Promise<unknown>;
  }> | null>;
}>;
type PhaseReport = Readonly<{ status: "complete" | "partial"; stopped: string | null; archived: number; deferred: number; day?: string }>;

/** Confirm that a full pass observed no unfinished work in the discovered scope. */
export function verifyFootballHistoryReferencePass(input: Readonly<{
  globalScope: boolean;
  interrupted: boolean;
  startedAt: UtcInstant;
  checkedAt: UtcInstant;
  providerDayEndsAt: number | null;
  currentProviderDayEndsAt: number | null;
  mappingAuthorized: boolean;
  subjectDiscovery: Readonly<{ indexed: number; hasMore: boolean; hasInvalid: boolean }> | null;
  phases: Readonly<Record<FootballHistoryReferencePhase, PhaseReport | null>>;
}>) {
  const { globalScope, interrupted, startedAt, checkedAt, providerDayEndsAt, currentProviderDayEndsAt,
    mappingAuthorized, subjectDiscovery, phases } = input;
  const observationDay = new Date(startedAt).toISOString().slice(0, 10);
  let reason: string | null = null;
  if (!globalScope) reason = "limited-competition-scope";
  else if (interrupted) reason = "interrupted";
  else if (providerDayEndsAt === null || !Number.isSafeInteger(providerDayEndsAt) || providerDayEndsAt !== currentProviderDayEndsAt ||
    checkedAt < startedAt || checkedAt >= providerDayEndsAt ||
    new Date(checkedAt).toISOString().slice(0, 10) !== observationDay) reason = "provider-day-ended";
  else if (!mappingAuthorized) reason = "odds-mapping-not-authorized";
  else if (!subjectDiscovery || subjectDiscovery.hasMore || subjectDiscovery.hasInvalid) reason = "pending-subject-discovery";
  else if (footballHistoryReferencePhases.some((phase) => {
    const report = phases[phase];
    return !report || report.status !== "complete" || report.stopped !== null || report.deferred !== 0;
  }) || phases.oddsMapping?.day !== observationDay) reason = "pending-reference-phases";
  // Fresh pages and subjects can open new selectors that this pass did not visit.
  else if (subjectDiscovery.indexed > 0 || footballHistoryReferencePhases.some((phase) => (phases[phase]?.archived ?? 0) > 0)) {
    reason = "reference-scope-changed";
  }
  return { scope: "discovered" as const, complete: reason === null, providerDayEndsAt, reason };
}

const stopReasons = new Set<ApiFootballErrorReason>(["quota-denied", "rate-limited", "operation-not-authorized",
  "authentication-error", "invalid-credential", "subscription-expired", "shared-work-pending"]);

function priority({ endpoint }: FootballHistoryReferenceTarget) {
  if (isFootballHistoryReferenceDictionary(endpoint)) return 3;
  if (endpoint === "teamsByCountry" || endpoint === "venuesByCountry") return 2;
  return endpoint === "teamStatistics" || endpoint === "coaches" || endpoint === "squads" || endpoint === "teamSeasons" ||
    endpoint === "coachProfiles" || endpoint === "fixtureRounds" || endpoint === "fixtureHalfStatistics" || isApiFootballLeaderboard(endpoint) ||
    isFootballHistoryPersonRecordEndpoint(endpoint) ? 0 : 1;
}

function acceptedPage(response: ReferenceResponse, selector: FootballHistoryReferenceSelector,
  started: UtcInstant, finished: UtcInstant, deadlineAt: UtcInstant, replayMaxAgeMs: number) {
  const [page] = response.provenance;
  const replay = page?.fromCache === true;
  if (response.status !== "complete" || response.error !== null || !response.completeness.complete || response.completeness.invalidRows !== 0 ||
    response.completeness.reasons.length !== 0 || response.completeness.missingIds.length !== 0 ||
    response.requestsDispatched !== (replay ? 0 : 1) || response.provenance.length !== 1 || !page ||
    page.provider !== "api-football" || page.endpoint !== selector.endpoint || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
    page.quota.kind !== "success" || page.currentPage !== 1 || (page.totalPages !== 1 && !(page.totalPages === 0 && response.data.length === 0)) ||
    !Number.isSafeInteger(page.retrievedAt) || page.retrievedAt > finished || page.retrievedAt >= deadlineAt ||
    (replay ? replayMaxAgeMs === 0 || page.retrievedAt < started - replayMaxAgeMs : page.retrievedAt < started)) return null;
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
  savePage(page: FootballHistoryReferencePage): Promise<unknown>;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
  replayMaxAgeMs?: number;
  priority?: "enrichment" | "historical-backfill";
  checkpoint?: FootballHistoryReferenceCheckpoint;
}>) {
  const { reference, hasPage, savePage, now, providerDayEndsAt, replayMaxAgeMs = 0, checkpoint, priority: dispatchPriority = "historical-backfill" } = options;

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
      const planned = [...plan.values()];
      if (dispatchPriority === "historical-backfill") planned.sort(({ target: left }, { target: right }) => {
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
        const attempt = await checkpoint?.begin(selector);
        if (checkpoint && !attempt) { totals.deferred++; continue; }

        const started = now(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(dayEnd, started + 45_000));
        const check = () => {
          if (dayStop() || now() >= deadlineAt) throw new Error("The historical reference request expired.");
        };
        totals.requested++;
        const response = await reference.page(target, { priority: dispatchPriority, deadlineAt, timeoutMs: 30_000,
          maxRequests: 1, maxPages: 1, maxRows: 10_000, maxResponseBytes: 24_000_000,
          retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 2500 }, cacheMaxAgeMs: 0,
          ...(replayMaxAgeMs > 0 ? { replayMaxAgeMs } : {}) },
        { signal, deadlineAt, check, beforeReserve: check, beforeDispatch: check });
        totals.requests += response.requestsDispatched;
        const page = acceptedPage(response, selector, started, now(), deadlineAt, replayMaxAgeMs);
        if (page) {
          const remaining = "subjectIds" in target && target.subjectIds.length > 1
            ? Math.max(0, target.subjectIds.length - page.rows.length) : 0;
          if (!attempt) await savePage(page);
          const saved = !attempt || await attempt.save(page, remaining);
          if (saved) totals.archived++;
          if (!saved || remaining > 0) totals.deferred++;
        } else {
          await attempt?.fail(response.error);
          totals.deferred++;
        }

        const reason = response.error?.reason;
        stopped = dayStop() ?? (reason && stopReasons.has(reason) ? reason : null);
        if (stopped) break;
        const transportFailure = reason === "transport-error" || reason === "deadline-exceeded";
        consecutiveTransportFailures = transportFailure ? consecutiveTransportFailures + 1 : 0;
        if (consecutiveTransportFailures >= 3) { stopped = "provider-transport-unavailable"; break; }
        if (response.requestsDispatched !== 1 && !page && !transportFailure) { stopped = reason ?? "reference-unavailable"; break; }
      }
      stopped ??= dayStop();
      if (!stopped && input.hasMoreTargets) stopped = totals.requests >= maxRequests ? "request-budget" : "target-limit";
      return { status: stopped || totals.deferred ? "partial" as const : "complete" as const, ...totals, stopped };
    },
  };
}
