import "server-only";

import { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { jobHash, jobInstant, jobVersion } from "../jobs/job-input.ts";

export class RecoveryError extends Error {
  readonly reason: "invalid-request" | "unauthorized" | "policy-required" | "unavailable";
  constructor(reason: RecoveryError["reason"]) {
    super("Recovery refused or unavailable; private diagnostics are withheld."); this.name = "RecoveryError"; this.reason = reason;
  }
}
export const recoveryFail = (reason: RecoveryError["reason"]): never => { throw new RecoveryError(reason); };
// Coded reasons/references only. No free text, URLs, credentials or provider payloads in audit output.
const ref = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,127}$/u).refine((value) => !value.includes("://"));
const duration = z.number().int().min(0).max(86_400_000);
export const recoveryScopes = ["runs", "jobs", "locks", "results", "settlement"] as const;
export const recoveryScope = z.enum(recoveryScopes);
export type RecoveryScope = z.infer<typeof recoveryScope>;
export const recoveryPolicySchema = z.strictObject({ version: z.literal(1), evidenceRef: ref,
  lookbackDays: z.number().int().min(1).max(7), maxItems: z.number().int().min(7).max(50),
  runGraceMs: duration, stalledJobMs: duration.refine((value) => value >= 1000), lockGraceMs: duration, resultGraceMs: duration,
  planTtlMs: z.number().int().min(1000).max(3_600_000), resultAccountId: jobHash.nullable(),
  job: z.strictObject({ priority: z.number().int().min(0).max(255), maxAttempts: z.number().int().min(1).max(16),
    timeoutMs: z.number().int().min(1000).max(300_000), leaseMs: z.number().int().min(1000).max(120_000),
    backoff: z.strictObject({ baseMs: z.number().int().min(100).max(60_000), maxMs: z.number().int().min(100).max(3_600_000) })
      .refine((value) => value.baseMs <= value.maxMs) }),
});
export type RecoveryPolicy = z.infer<typeof recoveryPolicySchema>;
export const recoveryAction = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("selection"), scheduledFor: jobInstant, selectionHash: jobHash.nullable() }),
  z.strictObject({ kind: z.literal("job"), jobId: jobHash, expectedVersion: jobVersion }),
  z.strictObject({ kind: z.literal("cutoff"), fixtureId: z.uuid(), cycleId: z.uuid() }),
  z.strictObject({ kind: z.literal("results"), accountId: jobHash }),
  z.strictObject({ kind: z.literal("settlement"), fixtureId: z.uuid() }),
  z.strictObject({ kind: z.literal("mapping"), externalId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    candidateExternalId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), evidenceRef: ref, sourceRef: ref,
    observedAt: jobInstant, retentionEvidenceRef: ref }),
]);
export type RecoveryAction = z.infer<typeof recoveryAction>;
export const recoveryDraft = z.strictObject({ version: z.literal(1), policyHash: jobHash,
  plannedAt: jobInstant, expiresAt: jobInstant, actions: z.array(recoveryAction).min(1).max(50) })
  .refine((value) => value.expiresAt > value.plannedAt);
export const recoveryPlan = recoveryDraft.safeExtend({ actor: ref, reason: ref, approvalRef: ref });
export type RecoveryPlan = z.infer<typeof recoveryPlan>;
export function parseRecovery<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return freezeEvidence(schema.parse(value)); } catch { return recoveryFail("invalid-request"); }
}
