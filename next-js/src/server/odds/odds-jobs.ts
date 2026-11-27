import "server-only";

import { z } from "zod";
import { addReportingDays, getReportingDate, getReportingDayBounds, parseReportingDate, utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import { jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob, type JobDefinition, type JobHandlerContext, type JobOutcome } from "../jobs/job-registry.ts";
import { OddsError, type OddsImportRequest, type OddsImportSummary, type OddsPolicy } from "./odds-contract.ts";
import type { OddsImportService } from "./odds-service.ts";

const HOUR = 3_600_000, DAY = 24 * HOUR;
export const ODDS_IMPORT_TYPE = "odds.import";
export const ODDS_CATALOG_TYPE = "odds.catalog";
export const ODDS_HISTORY_TYPE = "odds.history";
export const ODDS_HANDLER_VERSION = 1;
/** Fixed sweep slot (3 hours, UTC-aligned). The date and bookmaker scope pin the work across restarts. */
export const ODDS_SWEEP_MS = 3 * HOUR;
const validSweepInterval = (interval: number) => Number.isSafeInteger(interval) && interval >= HOUR && interval <= 6 * HOUR &&
  interval % HOUR === 0 && DAY % interval === 0;
export const oddsImportPayload = z.strictObject({ slot: jobInstant, date: z.iso.date(), bookmakerScope: z.literal("all").optional(),
  sweepMs: z.number().refine(validSweepInterval).optional() });
export const oddsCatalogPayload = z.strictObject({ utcDay: z.iso.date() });
const oddsHistoryPayload = z.strictObject({ date: z.iso.date(), providerDay: jobInstant }).refine(({ providerDay }) => providerDay % DAY === 0);
export const PRE_MATCH_HISTORY_DAYS = 7;
export const PRE_MATCH_PROVIDER_LOOKAHEAD_DAYS = 14;
export const oddsHistoryDeadline = (dateEnd: number, providerDay: number) => Math.min(dateEnd + PRE_MATCH_HISTORY_DAYS * DAY, providerDay + DAY);
/** One odds job attempt runs at most this long. */
export const ODDS_JOB_TIMEOUT_MS = 300_000;
/** The provider walk of one attempt ends this long after it starts (or at its slot's end), so the receipt and the
 * per-fixture writes keep at least two minutes of the job timeout for themselves. */
export const ODDS_PROVIDER_WINDOW_MS = 180_000;
const envelopeBounds = Object.freeze({ maxAttempts: 8, timeoutMs: ODDS_JOB_TIMEOUT_MS, leaseMs: 30_000, fallbackReserveMs: 0,
  backoff: Object.freeze({ baseMs: 60_000, maxMs: 900_000 }) });

/** The latest slot start at or before now. */
export function latestOddsSlot(now: number, sweepMs = ODDS_SWEEP_MS): number { return Math.floor(now / sweepMs) * sweepMs; }
/** EAT reporting dates swept from one slot: today first, up to the horizon. */
export function oddsSlotDates(slot: number, horizonDays: number): string[] {
  const today = getReportingDate(utcInstantFromEpochMilliseconds(slot));
  return Array.from({ length: Math.max(0, Math.min(7, horizonDays)) }, (_, offset) => addReportingDays(today, offset));
}
/** One odds import per (slot, EAT date). Nearest dates run first; the job expires when its slot ends. */
export function oddsImportEnvelope(slot: number, date: string, offset: number, bookmakerScope?: OddsPolicy["bookmakerScope"],
  sweepMs = ODDS_SWEEP_MS): JobEnvelope {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 6) throw new RangeError("Invalid odds slot.");
  return priceEnvelope(slot, date, 7 - offset, sweepMs, bookmakerScope);
}
function priceEnvelope(slot: number, date: string, priority: number, sweepMs: number, bookmakerScope?: OddsPolicy["bookmakerScope"]): JobEnvelope {
  if (!validSweepInterval(sweepMs) || !Number.isSafeInteger(slot) || slot % sweepMs !== 0) throw new RangeError("Invalid odds slot.");
  const payload = oddsImportPayload.parse({ slot, date: parseReportingDate(date), ...(bookmakerScope === undefined ? {} : { bookmakerScope }),
    ...(sweepMs === ODDS_SWEEP_MS ? {} : { sweepMs }) });
  return parseJobEnvelope({ ...envelopeBounds, version: 1, type: ODDS_IMPORT_TYPE, handlerVersion: ODDS_HANDLER_VERSION,
    idempotencyKey: evidenceFingerprint({ type: ODDS_IMPORT_TYPE, ...payload }), payload, refresh: null,
    notBefore: slot, expiresAt: slot + sweepMs, priority });
}
/** Every import of one slot, nearest EAT date first. */
export function oddsSlotEnvelopes(slot: number, horizonDays: number, bookmakerScope?: OddsPolicy["bookmakerScope"],
  sweepMs = ODDS_SWEEP_MS): readonly JobEnvelope[] {
  return Object.freeze(oddsSlotDates(slot, horizonDays).map((date, offset) => oddsImportEnvelope(slot, date, offset, bookmakerScope, sweepMs)));
}
/** What the live runner enqueues at each new slot: the UTC day's catalog (one row per day, however often it is
 * re-enqueued), then the slot's imports. The catalog goes first so the worker cannot claim a sweep before it exists. */
export function oddsScheduleEnvelopes(now: number, horizonDays: number, bookmakerScope?: OddsPolicy["bookmakerScope"],
  options?: { providerLookahead?: true; sweepMs?: number }): readonly JobEnvelope[] {
  const sweepMs = options?.sweepMs ?? ODDS_SWEEP_MS;
  const slot = latestOddsSlot(now, sweepMs), near = oddsSlotEnvelopes(slot, horizonDays, bookmakerScope, sweepMs);
  const today = getReportingDate(utcInstantFromEpochMilliseconds(slot));
  const distant = options?.providerLookahead ? Array.from({ length: PRE_MATCH_PROVIDER_LOOKAHEAD_DAYS + 1 - near.length }, (_, index) =>
    priceEnvelope(slot, addReportingDays(today, near.length + index), 0, sweepMs, bookmakerScope)) : [];
  return Object.freeze([oddsCatalogEnvelope(now), ...near, ...distant]);
}
/** Each provider day can resume an eligible historical date after the shared quota resets. */
export function oddsHistoryScheduleEnvelopes(now: number): readonly JobEnvelope[] {
  const providerDay = Math.floor(now / DAY) * DAY, today = getReportingDate(utcInstantFromEpochMilliseconds(now));
  return Object.freeze(Array.from({ length: PRE_MATCH_HISTORY_DAYS }, (_, index) => {
    const date = addReportingDays(today, index - PRE_MATCH_HISTORY_DAYS);
    const { endExclusive } = getReportingDayBounds(date);
    const deadline = endExclusive + PRE_MATCH_HISTORY_DAYS * DAY;
    const payload = oddsHistoryPayload.parse({ date, providerDay });
    return parseJobEnvelope({ ...envelopeBounds, version: 1, type: ODDS_HISTORY_TYPE, handlerVersion: ODDS_HANDLER_VERSION,
      idempotencyKey: evidenceFingerprint({ type: ODDS_HISTORY_TYPE, ...payload }), payload, refresh: null,
      notBefore: Math.max(endExclusive, providerDay), expiresAt: oddsHistoryDeadline(endExclusive, providerDay),
      priority: Math.max(1, 7 - Math.floor((deadline - providerDay - 1) / DAY)) });
  }));
}
export function oddsHistoryScopeId(accountKey: string, date: string): string {
  return evidenceFingerprint({ type: ODDS_HISTORY_TYPE, accountKey, date });
}
/** One bet and bookmaker catalog refresh per UTC day. Its priority (8) is above every price sweep (7 to 1), so the
 * day's catalog is stored before that day's sweeps on the shared enrichment worker; projections map against it. */
export function oddsCatalogEnvelope(now: number): JobEnvelope {
  const start = Math.floor(now / DAY) * DAY, utcDay = new Date(start).toISOString().slice(0, 10);
  return parseJobEnvelope({ ...envelopeBounds, version: 1, type: ODDS_CATALOG_TYPE, handlerVersion: ODDS_HANDLER_VERSION,
    idempotencyKey: evidenceFingerprint({ type: ODDS_CATALOG_TYPE, utcDay }), payload: oddsCatalogPayload.parse({ utcDay }), refresh: null,
    notBefore: start, expiresAt: start + DAY, priority: 8 });
}

/** Durable counters of the open provider day. `used` counts every request of the day (odds included);
 * `oddsUsed` counts the dispatched enrichment attempts, which odds and the team-code import make: both spend the one
 * spare under this gate (team-code-jobs.ts), so together they never exceed it. */
export type OddsQuotaUsage = Readonly<{ remaining: number; used: number; oddsUsed: number }>;
/** The plan's odds allowance: the whole day's ordinary need (`floor`), the odds share above it (`spare`) and the
 * reserve odds never take even when ordinary work has overspent its plan. */
export type OddsQuotaAllowance = Readonly<{ floor: number; spare: number; reserve: number }>;
/** The quota gate checks the requested dispatch allowance before provider work, so ordinary work keeps its full floor.
 * Ordinary requests already spent are not reserved twice: the remaining allowance must still cover the ordinary need
 * that is left (floor minus what ordinary work has used), and never less than the reserve. The second check only binds
 * when the provider reports fewer requests left than the limiter counted, or ordinary work has run past its plan. */
export function oddsQuotaAllows(usage: OddsQuotaUsage, allowance: OddsQuotaAllowance, maxRequests: number): boolean {
  const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (![usage.remaining, usage.used, usage.oddsUsed, allowance.floor, allowance.spare, allowance.reserve, maxRequests].every(integer)) return false;
  if (usage.oddsUsed + maxRequests > allowance.spare) return false;
  const ordinaryUsed = Math.max(0, usage.used - usage.oddsUsed);
  return usage.remaining - maxRequests >= Math.max(allowance.reserve, allowance.floor - ordinaryUsed);
}
export type OddsJobDependencies = Readonly<{
  service: OddsImportService;
  policy: () => OddsPolicy;
  /** False on plans without spare ordinary quota, or when the owner keeps imports off. */
  enabled: () => boolean;
  /** Counters of the open provider day, or null while no provider day is open (the UTC rollover is settling). */
  usage: () => Promise<OddsQuotaUsage | null>;
  allowance: OddsQuotaAllowance;
  maxRequests: (kind: OddsImportRequest["kind"]) => number;
  /** Each resumed price page spends the shared atomic quota independently. */
  resumePricePages?: boolean;
  historical?: Readonly<{ scopeId(date: string): string;
    report?(date: string, summary: OddsImportSummary | null, state: "stored" | "scanned" | "deferred"): void }>;
  report?: (request: OddsImportRequest, summary: OddsImportSummary) => void;
  now?: () => number;
}>;
/** Expired, not failed: the next slot sweeps again, and the failed-jobs alert stays for real faults. */
const EXPIRED: JobOutcome = Object.freeze({ status: "failed", reason: "eligibility-expired", retryable: false });
/** Provider failures a later attempt inside the same slot can clear. */
const transientReasons = new Set(["transport-error", "rate-limited", "quota-denied", "deadline-exceeded", "shared-work-pending"]);
/** Failures that need the owner or a code fix (credentials, subscription, authorization, a malformed request). */
const refusedReasons = new Set(["invalid-credential", "authentication-error", "subscription-expired", "operation-not-authorized", "invalid-request"]);
/** The job outcome for a stored receipt. A resumable sweep can retry from its next page within the slot. */
export function oddsJobOutcome(summary: Pick<OddsImportSummary, "status" | "error" | "continuation">): JobOutcome {
  if (summary.status === "complete" && summary.error === null) return { status: "succeeded" };
  const error = summary.error;
  if (error === null) return { status: "failed", reason: "invalid-output", retryable: false };
  if (summary.continuation && error.retryable) return { status: "failed",
    reason: error.reason === "quota-denied" || error.reason === "rate-limited" ? "rate-limited" : "handler-failed", retryable: true };
  // The essential reserve and the daily limit only tighten within a provider day, and a slot never spans two.
  if (error.reason === "quota-denied" && !error.retryable) return EXPIRED;
  if (transientReasons.has(error.reason)) {
    return { status: "failed", reason: error.reason === "quota-denied" || error.reason === "rate-limited" ? "rate-limited" : "handler-failed", retryable: true };
  }
  if (refusedReasons.has(error.reason)) return { status: "failed", reason: "non-retryable", retryable: false };
  return { status: "failed", reason: "invalid-output", retryable: false };
}
async function run(context: JobHandlerContext, dependencies: OddsJobDependencies, request: Omit<OddsImportRequest, "id" | "policy">,
  operation: (request: OddsImportRequest) => Promise<OddsImportSummary>, slotEnd: number, bookmakerScope?: OddsPolicy["bookmakerScope"]): Promise<JobOutcome> {
  const now = dependencies.now ?? Date.now;
  await context.checkpoint();
  // Disabled definitions stay registered (their eligible() hook is false), so queued jobs expire instead of stalling.
  if (!dependencies.enabled() || now() >= slotEnd) return EXPIRED;
  const policy = dependencies.policy();
  if (request.kind === "prices" && !request.recovery &&
    (policy.bookmakerScope !== bookmakerScope || policy.sweepMs !== slotEnd - request.slot)) return EXPIRED;
  const fullRequest = { ...request, id: request.recovery ? dependencies.historical!.scopeId(request.date!) : context.lease.jobId, policy };
  if (request.recovery) {
    try {
      if (await dependencies.service.historicalComplete(fullRequest)) {
        dependencies.historical?.report?.(request.date!, null, "stored");
        return { status: "succeeded" };
      }
    } catch (error) {
      return { status: "failed", reason: "handler-failed", retryable: error instanceof OddsError && error.reason === "unavailable" };
    }
  }
  // Quota gate. Before the new provider day opens, wait briefly and retry within the slot.
  const usage = await dependencies.usage();
  if (usage === null) return { status: "failed", reason: "rate-limited", retryable: true };
  // The gate's slack never grows within a provider day (odds spend only rises; an ordinary request lowers the remaining
  // allowance and the ordinary need left by one each), and UTC-aligned slots never span two days, so a refused slot
  // cannot recover: it expires without a provider call and the next slot checks again.
  const resume = request.recovery || request.kind === "prices" && dependencies.resumePricePages;
  if (!oddsQuotaAllows(usage, dependencies.allowance, resume ? 1 : dependencies.maxRequests(request.kind))) {
    if (request.recovery) dependencies.historical?.report?.(request.date!, null, "deferred");
    return EXPIRED;
  }
  const reference = evidenceFingerprint({ jobId: context.lease.jobId, attemptId: context.lease.attemptId,
    phase: request.recovery ? "odds-history" : `odds-${request.kind}`, version: 1 });
  const started = now();
  let summary: OddsImportSummary;
  try {
    summary = await operation(fullRequest);
  } catch (error) {
    // The dispatch count is unknown after a storage failure; record the attempt as uncertain.
    await context.recordUsage({ provider: "football", requestReference: reference, costReference: null, phase: "uncertain", requests: 0,
      durationMs: Math.min(3_600_000, Math.max(0, now() - started)) });
    return { status: "failed", reason: "handler-failed", retryable: error instanceof OddsError && error.reason === "unavailable" };
  }
  await context.recordUsage({ provider: "football", requestReference: reference, costReference: null, phase: "completed",
    requests: summary.requestsDispatched, durationMs: Math.min(3_600_000, Math.max(0, now() - started)) });
  await context.checkpoint();
  if (request.recovery) dependencies.historical?.report?.(request.date!, summary, "scanned");
  else dependencies.report?.(fullRequest, summary);
  return oddsJobOutcome(summary);
}

/** Registered on the dedicated enrichment worker (odds and team codes) only; never on the refresh/cutoff workers. */
export function createOddsJobDefinitions(dependencies: OddsJobDependencies): readonly JobDefinition[] {
  const eligible = () => dependencies.enabled();
  const importDefinition = defineJob({ type: ODDS_IMPORT_TYPE, handlerVersion: ODDS_HANDLER_VERSION, payload: oddsImportPayload, eligible,
    handle: (payload, context) => run(context, dependencies, { kind: "prices", slot: payload.slot as UtcInstant, date: payload.date },
      (request) => dependencies.service.importDate(request, context.signal, dependencies.resumePricePages ? () => context.checkpoint() : undefined),
      payload.slot + (payload.sweepMs ?? ODDS_SWEEP_MS), payload.bookmakerScope) });
  const catalogDefinition = defineJob({ type: ODDS_CATALOG_TYPE, handlerVersion: ODDS_HANDLER_VERSION, payload: oddsCatalogPayload, eligible,
    async handle(payload, context) {
      const start = Date.parse(`${payload.utcDay}T00:00:00Z`);
      for (const kind of ["bets", "bookmakers"] as const) {
        const outcome = await run(context, dependencies, { kind, slot: start as UtcInstant, date: null },
          (request) => dependencies.service.importCatalog(request), start + DAY);
        if (outcome.status !== "succeeded") return outcome;
      }
      return { status: "succeeded" };
    } });
  const historyDefinition = defineJob({ type: ODDS_HISTORY_TYPE, handlerVersion: ODDS_HANDLER_VERSION, payload: oddsHistoryPayload,
    eligible: () => eligible() && dependencies.historical !== undefined,
    handle: ({ date, providerDay }, context) => {
      const { endExclusive } = getReportingDayBounds(parseReportingDate(date));
      if (!dependencies.historical || endExclusive >= providerDay + DAY || endExclusive + PRE_MATCH_HISTORY_DAYS * DAY <= providerDay ||
        (dependencies.now ?? Date.now)() < endExclusive) return Promise.resolve(EXPIRED);
      const periodEnd = oddsHistoryDeadline(endExclusive, providerDay);
      return run(context, dependencies, { kind: "prices", slot: endExclusive, date, recovery: true },
        (request) => dependencies.service.importHistoricalDate(request, context.signal, () => context.checkpoint()), periodEnd);
    } });
  return Object.freeze([importDefinition, catalogDefinition, ...(dependencies.historical ? [historyDefinition] : [])]);
}
