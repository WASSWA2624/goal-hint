import "server-only";

import { z } from "zod";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseJobEnvelope } from "../jobs/job-input.ts";
import { historyHash, historyId } from "./history-input.ts";
import { cutoffFail, type CutoffPolicy, type CutoffRecoveryInput, type CutoffTarget, type VoidLockedCycleInput } from "./cutoff-contract.ts";
import type { StoredCycle } from "./history-contract.ts";

export const CUTOFF_JOB_TYPE = "prediction.cutoff";
export const cutoffTargetSchema = z.strictObject({ fixtureId: historyId, cycleId: historyId });
export const cutoffPayloadSchema = cutoffTargetSchema.extend({ scheduleVersion: z.number().int().positive().max(4_294_967_295),
  recoveryKey: historyHash.nullable() });
export type CutoffPayload = z.infer<typeof cutoffPayloadSchema>;
const label = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]+$/u);
const actor = { actor: label(128), reason: label(2000), evidenceRef: label(512) };
export function parseCutoff<Value>(schema: z.ZodType<Value>, input: unknown): Value {
  try { return freezeEvidence(schema.parse(input)); } catch { return cutoffFail("invalid-request"); }
}
export function parseCutoffTarget(input: unknown): CutoffTarget { return parseCutoff(cutoffTargetSchema, input); }
export function parseCutoffVoid(input: unknown): VoidLockedCycleInput { return parseCutoff(cutoffTargetSchema.extend(actor), input); }
export function parseCutoffRecovery(input: unknown): CutoffRecoveryInput {
  return parseCutoff(cutoffTargetSchema.extend({ ...actor, recoveryKey: historyHash }), input);
}
export function parseCutoffPolicy(input: unknown): CutoffPolicy {
  if (input == null) return cutoffFail("policy-required");
  return parseCutoff(z.strictObject({ version: z.literal(1), evidenceRef: label(512), job: z.strictObject({
    priority: z.number().int().min(0).max(255), maxAttempts: z.number().int().min(1).max(16),
    timeoutMs: z.number().int().min(100).max(3_600_000), leaseMs: z.number().int().min(1000).max(120_000),
    backoff: z.strictObject({ baseMs: z.number().int().min(100).max(60_000), maxMs: z.number().int().min(100).max(3_600_000) })
      .refine((value) => value.baseMs <= value.maxMs),
  }) }), input);
}
/** No cutoff-based expiry: a close job remains executable after downtime. */
export function cutoffEnvelope(cycle: StoredCycle, policy: CutoffPolicy, recoveryKey: string | null = null) {
  return parseJobEnvelope({ version: 1, type: CUTOFF_JOB_TYPE, handlerVersion: 1,
    idempotencyKey: evidenceFingerprint({ cycleId: cycle.id, scheduleVersion: cycle.scheduleVersion, recoveryKey }),
    payload: { fixtureId: cycle.fixtureId, cycleId: cycle.id, scheduleVersion: cycle.scheduleVersion, recoveryKey },
    refresh: null, notBefore: cycle.cutoffAt, expiresAt: Date.UTC(9999, 11, 31, 23, 59, 59, 999),
    fallbackReserveMs: 0, ...policy.job });
}
