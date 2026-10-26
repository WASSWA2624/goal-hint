import "server-only";

import type { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { jobFail, type JobEnvelope, type JobLease, type JobQueue, type JobReason, type JobUsage, type StoredJob } from "./job-contract.ts";
import { jobFingerprint, jobType, jobVersion, parseJob, parseJobEnvelope } from "./job-input.ts";

export type JobOutcome = Readonly<{ status: "succeeded" }> | Readonly<{ status: "failed"; reason: Exclude<JobReason, "completed">; retryable: boolean }>;
export type JobHandlerContext = Readonly<{
  lease: JobLease; signal: AbortSignal; deadlineAt: number; primaryDeadlineAt: number;
  remainingMs(reserveFallback?: boolean): number;
  checkpoint(): Promise<void>;
  recordUsage(usage: JobUsage): Promise<void>;
}>;
export type JobDefinition = Readonly<{
  type: string; handlerVersion: number; parse(payload: unknown): unknown;
  eligible(payload: unknown, signal: AbortSignal): Promise<boolean>;
  handle(payload: unknown, context: JobHandlerContext): Promise<JobOutcome>;
  settled?(job: StoredJob): Promise<void>;
}>;
export function defineJob<Payload>(input: Readonly<{
  type: string; handlerVersion: number; payload: z.ZodType<Payload>;
  eligible?: (payload: Payload, signal: AbortSignal) => boolean | Promise<boolean>;
  handle(payload: Payload, context: JobHandlerContext): Promise<JobOutcome>;
  settled?: (job: StoredJob) => Promise<void>;
}>): JobDefinition {
  parseJob(jobType, input.type); parseJob(jobVersion, input.handlerVersion);
  const parse = (payload: unknown) => freezeEvidence(parseJob(input.payload, payload));
  return Object.freeze({ type: input.type, handlerVersion: input.handlerVersion, parse,
    async eligible(payload: unknown, signal: AbortSignal) { return input.eligible ? await input.eligible(parse(payload), signal) === true : true; },
    handle: (payload: unknown, context: JobHandlerContext) => input.handle(parse(payload), context),
    ...(input.settled ? { settled: input.settled } : {}),
  });
}
export function createJobRegistry(definitions: readonly JobDefinition[]) {
  if (definitions.length > 64) return jobFail("invalid-request");
  const entries = new Map<string, JobDefinition>();
  for (const definition of definitions) {
    const key = `${definition.type}:${definition.handlerVersion}`;
    if (entries.has(key)) return jobFail("invalid-request");
    entries.set(key, definition);
  }
  const find = (type: string, handlerVersion: number) => entries.get(`${type}:${handlerVersion}`);
  return Object.freeze({
    types: freezeEvidence(definitions.map(({ type, handlerVersion }) => ({ type, handlerVersion }))), find,
    validate(input: unknown): JobEnvelope {
      const envelope = parseJobEnvelope(input), definition = find(envelope.type, envelope.handlerVersion);
      if (!definition) return jobFail("invalid-request");
      const payload = definition.parse(envelope.payload);
      // Registry validators are canonical validators, not non-idempotent transforms.
      if (jobFingerprint(payload) !== jobFingerprint(envelope.payload)) return jobFail("invalid-request");
      return envelope;
    },
    enqueue(queue: JobQueue, input: JobEnvelope) { return queue.enqueue(this.validate(input)); },
  });
}
export type JobRegistry = ReturnType<typeof createJobRegistry>;
