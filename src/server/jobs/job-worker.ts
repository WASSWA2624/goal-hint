import "server-only";

import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { JobQueueError, type JobLease, type JobQueue, type JobReason } from "./job-contract.ts";
import { jobHash, jobReason, parseJob } from "./job-input.ts";
import type { JobHandlerContext, JobRegistry } from "./job-registry.ts";

export type WorkerEvent = Readonly<{ kind: "claimed" | "succeeded" | "failed" | "lost-lease" | "unavailable";
  jobId: string | null; attemptId: string | null; reason: JobReason | null }>;
const outcomeSchema = z.discriminatedUnion("status", [z.strictObject({ status: z.literal("succeeded") }),
  z.strictObject({ status: z.literal("failed"), reason: jobReason.exclude(["completed"]), retryable: z.boolean() })]);
class WorkerStop extends Error {
  readonly reason: JobReason;
  constructor(reason: JobReason) { super("Job execution stopped."); this.reason = reason; }
}

export function createJobWorker(input: Readonly<{ queue: JobQueue; registry: JobRegistry; ownerId: string;
  onEvent?: (event: WorkerEvent) => void; pollMs?: number }>) {
  parseJob(jobHash, input.ownerId);
  const pollMs = input.pollMs ?? 1000;
  if (!Number.isInteger(pollMs) || pollMs < 50 || pollMs > 60_000) throw new JobQueueError("invalid-request");
  const emit = (kind: WorkerEvent["kind"], lease: JobLease | null, reason: JobReason | null = null) => {
    try { input.onEvent?.(Object.freeze({ kind, jobId: lease?.jobId ?? null, attemptId: lease?.attemptId ?? null, reason })); }
    catch { /* Observability cannot alter durable outcomes or print callback errors. */ }
  };
  let running = false;
  async function runOnce(stopSignal?: AbortSignal): Promise<boolean> {
    if (running) throw new JobQueueError("invalid-request");
    if (stopSignal?.aborted || input.registry.types.length === 0) return false;
    running = true;
    let lease: JobLease | null = null, timeout: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let rejectStop: (error: unknown) => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    // Install the rejection consumer before shutdown/heartbeat can race the handler.
    void stopped.catch(() => {});
    const abort = (reason: JobReason) => {
      if (!controller.signal.aborted) { controller.abort(); rejectStop(new WorkerStop(reason)); }
    };
    const shutdown = () => abort("worker-stopping");
    stopSignal?.addEventListener("abort", shutdown, { once: true });
    let renewChain: Promise<void> = Promise.resolve();
    try {
      const claimStarted = performance.now();
      lease = await input.queue.claim(input.ownerId, input.registry.types);
      if (!lease) return false;
      emit("claimed", lease);
      const claimed = lease, started = claimStarted;
      const remainingMs = (reserveFallback = false) => Math.max(0, Math.floor(claimed.deadlineAt - claimed.serverNow -
        (performance.now() - started) - (reserveFallback ? claimed.job.envelope.fallbackReserveMs : 0)));
      timeout = setTimeout(() => abort(claimed.deadlineAt === claimed.job.envelope.expiresAt ? "eligibility-expired" : "timeout"), remainingMs());
      const definition = input.registry.find(claimed.job.envelope.type, claimed.job.envelope.handlerVersion);
      if (!definition) throw new WorkerStop("unknown-handler");
      const payload = definition.parse(claimed.job.envelope.payload);
      const renew = () => {
        renewChain = renewChain.then(async () => {
          if (controller.signal.aborted) throw new WorkerStop("worker-stopping");
          lease = await input.queue.renew(lease!);
        });
        return renewChain;
      };
      const beat = () => { heartbeat = setTimeout(() => {
        void renew().then(beat).catch(() => abort("lease-expired"));
      }, Math.max(100, Math.floor(claimed.job.envelope.leaseMs / 3))); };
      beat();
      const checkpoint = async () => {
        if (controller.signal.aborted) throw new WorkerStop("worker-stopping");
        if (remainingMs() <= 0) throw new WorkerStop(claimed.deadlineAt === claimed.job.envelope.expiresAt ? "eligibility-expired" : "timeout");
        if (!await definition.eligible(payload, controller.signal)) throw new WorkerStop("eligibility-expired");
        await renew();
        if (controller.signal.aborted) throw new WorkerStop("worker-stopping");
      };
      const context: JobHandlerContext = Object.freeze({ lease: claimed, signal: controller.signal, deadlineAt: claimed.deadlineAt,
        primaryDeadlineAt: claimed.deadlineAt - claimed.job.envelope.fallbackReserveMs, remainingMs, checkpoint,
        async recordUsage(usage) { await checkpoint(); await input.queue.recordUsage(lease!, usage); },
      });
      const execute = async () => {
        await checkpoint();
        const result = parseJob(outcomeSchema, await definition.handle(payload, context));
        await checkpoint();
        return result;
      };
      const result = await Promise.race([execute(), stopped]);
      clearTimeout(heartbeat); await renewChain;
      if (result.status === "succeeded") { await input.queue.acknowledge(lease!); emit("succeeded", lease); }
      else { await input.queue.retry(lease!, result.reason, result.retryable); emit("failed", lease, result.reason); }
      return true;
    } catch (error) {
      clearTimeout(heartbeat); controller.abort(); await renewChain.catch(() => {});
      const reason: JobReason = error instanceof WorkerStop ? error.reason :
        error instanceof JobQueueError && error.reason === "invalid-request" ? "invalid-payload" :
        error instanceof JobQueueError && error.reason === "lost-lease" ? "lease-expired" : "handler-failed";
      if (lease) {
        try {
          await input.queue.retry(lease, reason, !["invalid-payload", "unknown-handler", "eligibility-expired", "non-retryable"].includes(reason));
          emit("failed", lease, reason);
        } catch (finalizeError) { emit(finalizeError instanceof JobQueueError && finalizeError.reason === "lost-lease" ? "lost-lease" : "unavailable", lease, reason); }
      } else emit("unavailable", null);
      return lease !== null;
    } finally {
      clearTimeout(timeout); clearTimeout(heartbeat); controller.abort();
      if (lease) {
        // Durable completion is authoritative. A repairable progress projection
        // failure must never redispatch an already completed paid job.
        try {
          const definition = input.registry.find(lease.job.envelope.type, lease.job.envelope.handlerVersion);
          if (definition?.settled) { const job = await input.queue.inspect(lease.jobId); if (job) await definition.settled(job); }
        } catch { emit("unavailable", lease); }
      }
      stopSignal?.removeEventListener("abort", shutdown); running = false;
    }
  }
  return Object.freeze({ runOnce, async run(signal: AbortSignal) {
    while (!signal.aborted) {
      const worked = await runOnce(signal);
      if (!worked && !signal.aborted) await sleep(pollMs, undefined, { signal }).catch(() => {});
    }
  } });
}
