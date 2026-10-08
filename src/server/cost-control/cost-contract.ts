import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";

/** USD picodollars: exactly twelve decimal places, persisted as DECIMAL(38,12). */
export type CostAmount = bigint;
export type CostCategory = "ai" | "research";
export type CostQuantities = Readonly<{ requests: number; inputTokens: number; outputTokens: number; billedUnits: number }>;
export type CostPriority = Readonly<{ kind: "fixture"; kickoffAt: UtcInstant }> | Readonly<{ kind: "background" }>;
export type CostPeriodPolicy = Readonly<{
  accountId: string; category: CostCategory; periodId: string; startsAt: UtcInstant; endsAt: UtcInstant;
  capUsdPicos: CostAmount; openingChargedUsdPicos: CostAmount; evidenceRef: string;
}>;
export type CostJobPolicy = Readonly<{
  accountId: string; category: CostCategory; jobId: string; workKey: string; costCapUsdPicos: CostAmount;
  requestLimit: number; inputTokenLimit: number; outputTokenLimit: number; billedUnitLimit: number;
  startsAt: UtcInstant; deadlineAt: UtcInstant; timeLimitMs: number; fallbackReserveMs: number; evidenceRef: string;
}>;
export type CostUnitRate = Readonly<{ amount: string; perUnits: number }>;
export type CostRateCard = Readonly<{
  category: CostCategory; provider: string; model: string | null; version: string; currency: string;
  startsAt: UtcInstant; endsAt: UtcInstant;
  usdConversion: Readonly<{ numerator: string; denominator: string; evidenceRef: string }>;
  rounding: "ceil-per-component"; billingRule: "measured-usage" | "invoice-required";
  rates: Readonly<{ requests: CostUnitRate | null; inputTokens: CostUnitRate | null; outputTokens: CostUnitRate | null; billedUnits: CostUnitRate | null }>;
  evidenceRef: string;
}>;
export type CostRequest = Readonly<{
  accountId: string; category: CostCategory; attemptId: string; jobId: string;
  rateVersion: string; provider: string; model: string | null; maximum: CostQuantities;
  timeoutMs: number; priority: CostPriority; evidenceRef: string;
}>;
export type CostUsage = Readonly<{
  attemptId: string; reconciliationId: string; kind: "complete" | "partial" | "unknown";
  observedQuantities: CostQuantities | null; elapsedMs: number;
  observedUsdPicos: CostAmount | null; invoicedUsdPicos: CostAmount | null;
  observedAt: UtcInstant; evidenceRef: string;
}>;
export type CostAuthority = Readonly<{
  authorize(category: CostCategory): void;
  verifyPeriod(policy: CostPeriodPolicy): boolean;
  verifyJob(policy: CostJobPolicy): boolean;
  verifyRate(rate: CostRateCard): boolean;
  verifyRequest(request: CostRequest, job: CostJobPolicy, period: CostPeriodPolicy, rate: CostRateCard): boolean;
  verifyUsage(usage: CostUsage, attempt: CostAttempt): boolean;
}>;
export type CostAccountState = {
  accountId: string; category: CostCategory; activePeriodId: string; lastNow: UtcInstant;
};
export type CostPeriodState = CostPeriodPolicy;
export type CostJobState = CostJobPolicy;
export type CostAttemptState = "queued" | "reserved" | "dispatched" | "completed" | "uncertain" | "canceled";
export type CostAttempt = {
  request: CostRequest; requestFingerprint: string; rate: CostRateCard;
  state: CostAttemptState; queuedAt: UtcInstant; reservedAt: UtcInstant | null;
  dispatchedAt: UtcInstant | null; completedAt: UtcInstant | null; launchBefore: UtcInstant | null;
  periodId: string | null; ownerToken: string | null;
  maximumCostUsdPicos: CostAmount; liabilityUsdPicos: CostAmount;
  estimatedUsdPicos: CostAmount | null; observedUsdPicos: CostAmount | null; invoicedUsdPicos: CostAmount | null;
  usage: CostUsage | null; reconciliationFingerprint: string | null;
  reconciliations: Array<{ id: string; fingerprint: string; usage: CostUsage }>;
};
export type CostDenialReason =
  | "invalid-request" | "operation-not-authorized" | "unverified-policy" | "unconfigured" | "unpriced"
  | "service-unavailable" | "unknown-account" | "unknown-job" | "unknown-attempt" | "conflicting-policy"
  | "clock-regression" | "period-inactive" | "budget-exhausted" | "job-budget-exhausted"
  | "request-limit" | "token-limit" | "billed-unit-limit" | "time-limit" | "fallback-time-reserved"
  | "priority-wait" | "already-attempted" | "dispatch-expired" | "invalid-permit"
  | "timeout" | "uncertain-usage" | "unverified-usage" | "conflicting-reconciliation";
export type CostPermit = Readonly<{
  attemptId: string; jobId: string; periodId: string; ownerToken: string;
  reservedAt: UtcInstant; launchBefore: UtcInstant; maximumCostUsdPicos: CostAmount;
}>;
export type CostDecision = Readonly<{ status: "reserved"; permit: CostPermit }>
  | Readonly<{ status: "joined"; attemptId: string; state: CostAttemptState }>
  | Readonly<{ status: "denied"; reason: CostDenialReason }>;
export type CostTotals = Readonly<{
  liabilityUsdPicos: CostAmount; estimatedUsdPicos: CostAmount; observedUsdPicos: CostAmount; invoicedUsdPicos: CostAmount;
  requests: bigint; inputTokens: bigint; outputTokens: bigint; billedUnits: bigint;
  elapsedMs: bigint; attemptCount: bigint; hasOverage: boolean;
}>;

/** The category/account lock covers every read, queue choice and ledger mutation. */
export interface CostTransaction {
  now(): Promise<UtcInstant>;
  account(): Promise<CostAccountState | null>;
  saveAccount(state: CostAccountState): Promise<void>;
  period(periodId: string): Promise<CostPeriodState | null>;
  savePeriod(state: CostPeriodState): Promise<void>;
  periods(): Promise<CostPeriodState[]>;
  job(jobId: string): Promise<CostJobState | null>;
  jobByWorkKey(workKey: string): Promise<CostJobState | null>;
  saveJob(state: CostJobState): Promise<void>;
  attempt(attemptId: string): Promise<CostAttempt | null>;
  saveAttempt(state: CostAttempt): Promise<void>;
  attempts(filter?: Readonly<{ periodId?: string; jobId?: string }>): Promise<CostAttempt[]>;
  totals(filter?: Readonly<{ periodId?: string; jobId?: string }>): Promise<CostTotals>;
  queued(): Promise<CostAttempt[]>;
}
export interface CostStore {
  transaction<Result>(accountId: string, category: CostCategory, operation: (transaction: CostTransaction) => Promise<Result>): Promise<Result>;
}
