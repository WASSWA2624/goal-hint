import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";

export const quotaPriorities = Object.freeze({
  "results-cutoff": Object.freeze({ rank: 0, essential: true }),
  recovery: Object.freeze({ rank: 0, essential: true }),
  "near-kickoff-fallback": Object.freeze({ rank: 1, essential: true }),
  "live-date-sync": Object.freeze({ rank: 1, essential: false }),
  "daily-inputs": Object.freeze({ rank: 2, essential: false }),
  enrichment: Object.freeze({ rank: 3, essential: false }),
} as const);

export type QuotaPriority = keyof typeof quotaPriorities;
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
  evidenceRef: string;
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
  dayLimit: number;
  used: number;
  ordinaryUsed: number;
  dayRemaining: number;
  minuteRemaining: number | null;
  minuteFloorUntil: UtcInstant | null;
  probeRequestId: string | null;
  evidenceRef: string;
  observationRevision: number;
};
export type QuotaRequest = Readonly<{
  requestId: string;
  workKey: string;
  priority: QuotaPriority;
  deadlineAt: UtcInstant;
  timeoutMs: number;
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
  | "invalid-reset-evidence" | "operation-not-authorized" | "dispatch-expired";
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
  now(): Promise<UtcInstant>;
  account(): Promise<QuotaAccountState | null>;
  saveAccount(state: QuotaAccountState): Promise<void>;
  period(id: string): Promise<QuotaPeriodState | null>;
  savePeriod(state: QuotaPeriodState): Promise<void>;
  attempt(id: string): Promise<QuotaAttempt | null>;
  inFlight(workKey: string): Promise<QuotaAttempt | null>;
  saveAttempt(attempt: QuotaAttempt): Promise<void>;
  rollingAttempts(since: UtcInstant): Promise<QuotaAttempt[]>;
  periodAttempts(periodId: string, afterSequence: number): Promise<QuotaAttempt[]>;
  unresolvedBefore(periodId: string, sequence: number): Promise<number>;
  queueHead(now: UtcInstant): Promise<QuotaAttempt | null>;
}
export interface QuotaStore {
  transaction<Result>(accountId: string, operation: (transaction: QuotaTransaction) => Promise<Result>): Promise<Result>;
}
