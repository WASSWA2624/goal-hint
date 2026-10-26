import "server-only";

import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { jobFail, jobReasons, type JobEnvelope } from "./job-contract.ts";

export const jobHash = z.string().regex(/^[a-f0-9]{64}$/u);
export const jobType = z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/u);
export const jobVersion = z.number().int().positive().max(4_294_967_295);
export const jobInstant = z.number().int().min(Date.UTC(1000, 0, 1)).max(Date.UTC(9999, 11, 31, 23, 59, 59, 999));
export const jobReason = z.enum(jobReasons);
export function parseJob<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return schema.parse(value); } catch { return jobFail("invalid-request"); }
}
const envelope = z.strictObject({
  version: z.literal(1), type: jobType, handlerVersion: jobVersion, idempotencyKey: jobHash, payload: z.json(),
  refresh: z.strictObject({ runId: z.uuid(), fixtureId: z.uuid(), cycleId: z.uuid() }).nullable(),
  notBefore: jobInstant, expiresAt: jobInstant, priority: z.number().int().min(0).max(255),
  maxAttempts: z.number().int().min(1).max(16), timeoutMs: z.number().int().min(100).max(3_600_000),
  leaseMs: z.number().int().min(1000).max(120_000), fallbackReserveMs: z.number().int().nonnegative(),
  backoff: z.strictObject({ baseMs: z.number().int().min(100).max(60_000), maxMs: z.number().int().min(100).max(3_600_000) }),
}).refine((value) => value.notBefore < value.expiresAt && value.fallbackReserveMs < value.timeoutMs &&
  value.backoff.baseMs <= value.backoff.maxMs);
export function parseJobEnvelope(value: unknown): JobEnvelope {
  const parsed = parseJob(envelope, value);
  if (Buffer.byteLength(evidenceSerialize(parsed), "utf8") > 65_536) return jobFail("invalid-request");
  return freezeEvidence(parsed);
}
export const jobFingerprint = evidenceFingerprint;
export const jobSerialize = evidenceSerialize;
export const durableJobId = (value: Pick<JobEnvelope, "type" | "handlerVersion" | "idempotencyKey">) =>
  createHash("sha256").update(JSON.stringify([value.type, value.handlerVersion, value.idempotencyKey])).digest("hex");
export const jobEnqueueBucket = (value: JobEnvelope) =>
  Number.parseInt((value.refresh ? jobFingerprint(value.refresh) : durableJobId(value)).slice(0, 2), 16) % 64;

/** Equal jitter: never immediate, bounded even at the maximum attempt count. */
export function retryDelay(envelope: Pick<JobEnvelope, "backoff">, attempt: number, sample = randomInt(0, 1_000_000) / 1_000_000): number {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 16 || sample < 0 || sample >= 1 || !Number.isFinite(sample)) return jobFail("invalid-request");
  const ceiling = Math.min(envelope.backoff.maxMs, envelope.backoff.baseMs * 2 ** (attempt - 1));
  return Math.max(1, Math.floor(ceiling / 2 + sample * ceiling / 2));
}
export const usageInput = z.strictObject({ provider: z.enum(["football", "research", "ai", "internal"]),
  requestReference: jobHash, costReference: jobHash.nullable(), phase: z.enum(["dispatched", "completed", "uncertain"]),
  requests: z.number().int().nonnegative().max(4_294_967_295), durationMs: z.number().int().nonnegative().max(3_600_000).nullable() });
