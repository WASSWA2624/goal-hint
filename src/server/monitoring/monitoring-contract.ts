import "server-only";

import { z } from "zod";
import { jobHash, jobInstant } from "../jobs/job-input.ts";
import { costUsdPicosFromDecimal } from "../cost-control/cost-input.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";

export class MonitoringError extends Error {
  readonly reason: "invalid-input" | "unauthorized" | "unavailable" | "policy-conflict";
  constructor(reason: MonitoringError["reason"]) {
    super("Monitoring refused or unavailable; private diagnostics are withheld."); this.name = "MonitoringError"; this.reason = reason;
  }
}
export const monitoringFail = (reason: MonitoringError["reason"]): never => { throw new MonitoringError(reason); };
export function parseMonitoring<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return freezeEvidence(schema.parse(value)); } catch { return monitoringFail("invalid-input"); }
}
export const monitoringRef = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = z.number().int().min(1000).max(7 * 86_400_000);
export const monitoringPolicySchema = z.strictObject({ version: z.literal(1), evidenceRef: monitoringRef,
  owner: monitoringRef, destination: monitoringRef, retentionEvidenceRef: monitoringRef,
  retentionMs: duration, reminderMs: duration, evidenceMaxAgeMs: duration,
  lookbackDays: z.number().int().min(1).max(7), accountId: jobHash.nullable(),
  thresholds: z.strictObject({ runGraceMs: duration, jobStallMs: duration, lockGraceMs: duration,
    staleMs: duration, resultDelayMs: duration, failureCount: count.refine((v) => v > 0),
    quotaRemainingWarn: count.refine((v) => v > 0), essentialReserveWarn: count.refine((v) => v > 0),
    rateLimitCount: count.refine((v) => v > 0), expiryWarnMs: duration,
    costWarnPercent: z.number().int().min(1).max(99) }),
});
export type MonitoringPolicy = z.infer<typeof monitoringPolicySchema>;
export const operationMetrics = ["available", "missing-runs", "partial-runs", "stalled-runs", "failed-jobs", "stalled-jobs",
  "source-failures", "cutoff-misses", "missing-locks", "stale-data", "poller-missing", "unresolved-results",
  "poller-delayed", "result-backlog", "final-badge-delays", "delayed-results", "recovery-failures", "recovery-completed", "jobs-completed", "job-duration-ms", "job-duration-count",
  "backup-failures", "backup-stale", "restore-verification-pending"] as const;
export type OperationMetric = typeof operationMetrics[number];
export const budgetCategories = ["football", "ai", "research", "database", "hosting", "monitoring", "network", "domain"] as const;
export type BudgetCategory = typeof budgetCategories[number];
const usd = z.string().max(39).refine((v) => { try { costUsdPicosFromDecimal(v); return true; } catch { return false; } });
export const monitoringCostSchema = z.strictObject({ category: z.enum(budgetCategories), startsAt: jobInstant,
  endsAt: jobInstant, measuredAt: jobInstant, capUsd: usd, committedUsd: usd, invoicedUsd: usd.nullable(),
  coverage: z.enum(["complete", "partial", "estimated"]), evidenceRef: monitoringRef,
}).refine((v) => v.startsAt < v.endsAt && (v.category !== "football" ||
  costUsdPicosFromDecimal(v.capUsd) <= 45_000_000_000_000n && v.endsAt - v.startsAt >= 28 * 86_400_000 && v.endsAt - v.startsAt <= 31 * 86_400_000));
export type MonitoringCost = z.infer<typeof monitoringCostSchema>;
export const monitoringReasons = ["completed", "timeout", "lease-expired", "eligibility-expired", "attempts-exhausted",
  "handler-failed", "non-retryable", "rate-limited", "budget-exhausted", "insufficient-evidence", "invalid-output",
  "published", "retained-previous", "unavailable", "skipped", "failed", "stale-observation", "stale-source", "older-run",
  "status-ineligible", "no-valid-family", "schedule-changed", "observation-unavailable", "early-play", "cutoff", "other"] as const;
export const monitoringSnapshotSchema = z.strictObject({ event: z.literal("operations-snapshot").default("operations-snapshot"), at: jobInstant,
  metrics: z.record(z.enum(operationMetrics), count.nullable()).refine((v) => v.available === null || v.available <= 1),
  quota: z.strictObject({ remaining: count, reserved: count, launched: count, uncertain: count, essentialUsed: count,
    essentialRemaining: count, essentialReserveUsed: count, rollingSecondLaunches: count, rollingMinuteLaunches: count,
    rateLimited: count, providerErrors: count, resetPending: z.boolean(),
    credentialFailure: z.boolean(), subscriptionExpired: z.boolean(), expiresAt: jobInstant,
  }).nullable(), costs: z.array(monitoringCostSchema).max(8).refine((v) => new Set(v.map((x) => x.category)).size === v.length),
  reasons: z.array(z.strictObject({ kind: z.enum(["job", "refresh-outcome", "refresh-reason"]), reason: z.enum(monitoringReasons), count })).max(monitoringReasons.length * 3),
  correlations: z.array(z.strictObject({ runId: z.uuid().nullable(), eatDate: z.iso.date().nullable(), fixtureId: z.uuid().nullable(),
    cycleId: z.uuid().nullable(), jobId: jobHash.nullable(), modelVersionId: jobHash.nullable() })).max(50),
});
export type MonitoringSnapshot = z.infer<typeof monitoringSnapshotSchema>;
export type MonitoringAuthority = Readonly<{
  authorize(operation: "inspect" | "notify"): boolean | Promise<boolean>;
  verifyPolicy(policy: MonitoringPolicy): boolean | Promise<boolean>;
}>;
export async function authorizeMonitoring(authority: MonitoringAuthority, policy: MonitoringPolicy, operation: "inspect" | "notify") {
  let allowed = false;
  try { allowed = await authority.authorize(operation) === true && await authority.verifyPolicy(policy) === true; } catch { /* Redacted. */ }
  if (!allowed) monitoringFail("unauthorized");
}
