import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";

export const jobReasons = ["completed", "invalid-payload", "unknown-handler", "non-retryable", "handler-failed",
  "timeout", "lease-expired", "eligibility-expired", "attempts-exhausted", "worker-stopping",
  "rate-limited", "budget-exhausted", "insufficient-evidence", "invalid-output"] as const;
export type JobReason = typeof jobReasons[number];
export class JobQueueError extends Error {
  readonly reason: "invalid-request" | "conflicting-request" | "lost-lease" | "unavailable" | "unauthorized";
  constructor(reason: JobQueueError["reason"]) {
    super("Job operation refused or unavailable; private diagnostics are withheld.");
    this.name = "JobQueueError"; this.reason = reason;
  }
}
export const jobFail = (reason: JobQueueError["reason"]): never => { throw new JobQueueError(reason); };
export type RefreshIdentity = Readonly<{ runId: string; fixtureId: string; cycleId: string }>;
export type JobEnvelope<Payload = unknown> = Readonly<{
  version: 1; type: string; handlerVersion: number; idempotencyKey: string; payload: Payload;
  refresh: RefreshIdentity | null; notBefore: number; expiresAt: number; priority: number;
  maxAttempts: number; timeoutMs: number; leaseMs: number; fallbackReserveMs: number;
  backoff: Readonly<{ baseMs: number; maxMs: number }>;
}>;
export type JobState = "pending" | "running" | "succeeded" | "failed" | "expired";
export type StoredJob = Readonly<{
  id: string; envelope: JobEnvelope; state: JobState; version: number; attemptCount: number; fence: number;
  availableAt: number; createdAt: number; updatedAt: number; ownerId: string | null;
  leaseExpiresAt: number | null; attemptDeadlineAt: number | null; finishedAt: number | null; terminalReason: JobReason | null;
}>;
export type JobLease = Readonly<{
  job: StoredJob; jobId: string; attemptId: string; ownerId: string; fence: number;
  leaseExpiresAt: number; deadlineAt: number; serverNow: number;
}>;
export type JobUsage = Readonly<{
  provider: "football" | "research" | "ai" | "internal"; requestReference: string; costReference: string | null;
  phase: "dispatched" | "completed" | "uncertain"; requests: number; durationMs: number | null;
}>;
export type JobTransaction = Prisma.TransactionClient;
export type JobQueue = Readonly<{
  enqueue(input: JobEnvelope): Promise<StoredJob>;
  enqueueInTransaction(transaction: JobTransaction, input: JobEnvelope): Promise<StoredJob>;
  withTransaction<Result>(operation: (enqueue: (input: JobEnvelope) => Promise<StoredJob>, transaction: JobTransaction) => Promise<Result>): Promise<Result>;
  claim(ownerId: string, types: readonly Readonly<{ type: string; handlerVersion: number }>[]): Promise<JobLease | null>;
  renew(lease: JobLease): Promise<JobLease>;
  acknowledge(lease: JobLease): Promise<StoredJob>;
  retry(lease: JobLease, reason: JobReason, retryable: boolean): Promise<StoredJob>;
  recordUsage(lease: JobLease, usage: JobUsage): Promise<void>;
  recordUsageInTransaction(transaction: JobTransaction, lease: JobLease, usage: JobUsage): Promise<void>;
  assertOwned(transaction: JobTransaction, lease: JobLease): Promise<number>;
  completeInTransaction(transaction: JobTransaction, lease: JobLease): Promise<StoredJob>;
  inspect(id: string): Promise<StoredJob | null>;
  history(id: string, afterVersion?: number, limit?: number): Promise<readonly Readonly<Record<string, unknown>>[]>;
  attempts(id: string): Promise<readonly Readonly<Record<string, unknown>>[]>;
  usage(id: string, afterVersion?: number, limit?: number): Promise<readonly Readonly<Record<string, unknown>>[]>;
}>;
