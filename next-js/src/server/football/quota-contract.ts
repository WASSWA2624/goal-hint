import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import { operatingRules } from "../config/runtime-policy.ts";

export const quotaPriorities = Object.freeze({
  "results-cutoff": Object.freeze({ rank: 0, essential: true }),
  recovery: Object.freeze({ rank: 0, essential: true }),
  "near-kickoff-fallback": Object.freeze({ rank: 1, essential: true }),
  "live-date-sync": Object.freeze({ rank: 1, essential: false }),
  "daily-inputs": Object.freeze({ rank: 2, essential: false }),
  enrichment: Object.freeze({ rank: 3, essential: false }),
  "live-details": Object.freeze({ rank: 3, essential: false }),
  "historical-backfill": Object.freeze({ rank: 4, essential: false }),
} as const);

export type QuotaPriority = keyof typeof quotaPriorities;
export const providerShortWindowShare = 0.8;
export const unknownProviderRequestsPerMinute = 5;
export const historicalBackfillMinuteShare = 0.2;
export const criticalWorkReserveRatio = 1.2;
export const providerDayReserveRatio = 0.05;
export const providerResetGraceMs = 15_000;
export const providerNetworkRetryDelaysMs: readonly number[] = Object.freeze([5_000, 30_000, 120_000]);
export const providerRetryJitterRatio = 0.1;
export const providerRetryAfterExhaustedMs = 3_600_000;
/** Endpoint paths only, without request parameters or credentials. */
export const quotaEndpointPattern = /^\/(?:[a-z][a-z0-9-]*)(?:\/[a-z][a-z0-9-]*){0,2}$/u;
/** The essential reserve is 20,000 of the 120,000-request ceiling. Smaller verified
 * plans keep the same one-sixth share, so ordinary daily work still has capacity. */
export function essentialReserveFor(dayLimit: number): number {
  const { essentialReserveRequests, requestsPerProviderDay } = operatingRules.football;
  return Math.min(essentialReserveRequests, Math.floor(Math.max(0, dayLimit) * essentialReserveRequests / requestsPerProviderDay));
}
export type QuotaPeriodEvidence = Readonly<{
  accountId: string;
  periodId: string;
  startsAt: UtcInstant;
  endsAt: UtcInstant;
  subscriptionExpiresAt: UtcInstant;
  providerDailyLimit: number;
  dailyRemaining: number;
  secondLimit: number;
  minuteLimit: number;
  /** Omitted for existing callers with verified provider limits. */
  shortWindowKnown?: boolean | undefined;
  evidenceRef: string;
  /** Time of an exact provider account usage observation, when available. */
  observedAt?: UtcInstant;
}>;
export type QuotaEvidenceVerifier = (
  evidence: QuotaPeriodEvidence,
  purpose: "initial-period" | "candidate-boundary" | "reset-confirmation",
  probeRequestId?: string,
) => boolean;

export type QuotaAccountState = {
  activePeriodId: string;
  candidatePeriodId: string | null;
  nextDispatchAt: UtcInstant;
  cooldownUntil: UtcInstant;
  lastNow: UtcInstant;
  lastLaunchedAt: UtcInstant;
  status: "active" | "credential-failure" | "subscription-expired";
};
export type QuotaPeriodState = {
  id: string;
  kind: "confirmed" | "candidate";
  startsAt: UtcInstant;
  endsAt: UtcInstant;
  subscriptionExpiresAt: UtcInstant;
  providerDailyLimit: number;
  secondLimit: number;
  minuteLimit: number;
  singleConcurrent?: boolean | undefined;
  dayLimit: number;
  used: number;
  ordinaryUsed: number;
  dayRemaining: number;
  minuteRemaining: number | null;
  minuteFloorUntil: UtcInstant | null;
  probeRequestId: string | null;
  evidenceRef: string;
  observationRevision: number;
  /** Durable dispatch counts; absent only in periods created before this contract. */
  priorityUsed?: Partial<Record<QuotaPriority, number>> | undefined;
  providerUsage?: { observedAt: UtcInstant; limit: number; remaining: number } | undefined;
};
export type QuotaRequest = Readonly<{
  requestId: string;
  workKey: string;
  priority: QuotaPriority;
  deadlineAt: UtcInstant;
  timeoutMs: number;
  endpoint?: string;
  retry?: boolean;
}>;
export type QuotaAttempt = {
  id: string;
  workKey: string | null;
  priority: QuotaPriority;
  rank: number;
  essential: boolean;
  queuedAt: UtcInstant;
  deadlineAt: UtcInstant;
  timeoutMs: number;
  state: "queued" | "attempted" | "completed" | "uncertain" | "expired";
  dispatchedAt: UtcInstant | null;
  leaseUntil: UtcInstant | null;
  periodId: string | null;
  sequence: number | null;
  ownerToken: string | null;
  responseKind: QuotaFeedback["kind"] | null;
  launchedAt: UtcInstant | null;
  observationRevision: number;
  endpoint?: string | undefined;
  retry?: boolean | undefined;
};
export type QuotaFeedback = Readonly<{
  kind: "success" | "uncertain" | "rate-limited" | "credential-failure" | "subscription-expired" | "provider-error";
  dailyLimit?: number;
  dailyRemaining?: number;
  minuteLimit?: number;
  minuteRemaining?: number;
  retryAfterMs?: number;
}>;
export type QuotaDenialReason =
  | "invalid-request" | "unverified-account" | "unknown-account" | "storage-unavailable"
  | "clock-regression" | "credential-failure" | "subscription-expired" | "request-expired"
  | "already-attempted" | "priority-wait" | "pacing" | "second-limit" | "minute-limit"
  | "daily-limit" | "essential-reserve" | "retry-delay" | "reset-unconfirmed"
  | "invalid-reset-evidence" | "operation-not-authorized" | "dispatch-expired" | "workload-budget";
export type QuotaPermit = Readonly<{
  requestId: string;
  periodId: string;
  ownerToken: string;
  dispatchedAt: UtcInstant;
  launchBefore: UtcInstant;
}>;
export type QuotaDecision =
  | Readonly<{ status: "reserved"; permit: QuotaPermit }>
  | Readonly<{ status: "joined"; requestId: string; leaseUntil: UtcInstant }>
  | Readonly<{ status: "denied"; reason: QuotaDenialReason; retryAt?: UtcInstant }>;

/** Every operation is serialized under one durable account row lock. */
export interface QuotaTransaction {
  /** Shared stable workload key, independent of a provider plan's rotating account id. */
  consumeBudget?(id: string, maximum: number, periodEndsAt: UtcInstant): Promise<boolean>;
  now(): Promise<UtcInstant>;
  account(): Promise<QuotaAccountState | null>;
  saveAccount(state: QuotaAccountState): Promise<void>;
  period(id: string): Promise<QuotaPeriodState | null>;
  savePeriod(state: QuotaPeriodState): Promise<void>;
  attempt(id: string): Promise<QuotaAttempt | null>;
  inFlight(workKey: string): Promise<QuotaAttempt | null>;
  saveAttempt(attempt: QuotaAttempt): Promise<void>;
  rollingAttempts(since: UtcInstant): Promise<QuotaAttempt[]>;
  /** Furthest lease of a reserved or launched request for unknown provider limits. */
  activeDispatchUntil?(now: UtcInstant): Promise<UtcInstant | null>;
  periodAttempts(periodId: string, afterSequence: number): Promise<QuotaAttempt[]>;
  /** Bounded aggregate for bootstrapping dispatch counts without loading historical payloads. */
  priorityCounts?(periodId: string): Promise<NonNullable<QuotaPeriodState["priorityUsed"]>>;
  unresolvedBefore(periodId: string, sequence: number): Promise<number>;
  queueHead(now: UtcInstant): Promise<QuotaAttempt | null>;
}

/** Trusted workload admission runs under the same account lock as the dispatch count. */
export type QuotaAdmission = (transaction: QuotaTransaction, period: QuotaPeriodState, attempt: Readonly<QuotaAttempt>, now: UtcInstant) => Promise<boolean>;
export interface QuotaStore {
  transaction<Result>(accountId: string, operation: (transaction: QuotaTransaction) => Promise<Result>): Promise<Result>;
}
