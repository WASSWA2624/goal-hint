import "server-only";

import { z } from "zod";
import { historyImportPhases, type historyImportCoverage, type historyImportStatus, type HistoryImportPhase } from "../../domain/football-coverage.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { JobQueue } from "../jobs/job-contract.ts";
import { jobFingerprint, jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob, type JobHandlerContext, type JobOutcome } from "../jobs/job-registry.ts";

type HistoryImportReport = Readonly<{ coverage: z.infer<typeof historyImportCoverage>; complete: boolean; stopped: string | null }>;
type ArchiveStep = (signal: AbortSignal) => Promise<HistoryImportReport>;

const type = "football.history";
const handlerVersion = 1;
const intervalMs = 30 * 60_000;
const timeoutMs = 5 * 60_000;
const payload = z.strictObject({ phase: z.enum(historyImportPhases), slot: jobInstant });
const quotaStops = new Set(["quota-denied", "rate-limited", "provider-day-ended", "odds-mapping-quota-unavailable"]);
const unavailableStops = new Set(["operation-not-authorized", "authentication-error", "invalid-credential", "subscription-expired", "unconfigured"]);
const plannedStops = new Set(["request-budget", "target-limit", "chunk-budget"]);

export function latestHistoryImportSlot(now: number) {
  return Math.floor(now / intervalMs) * intervalMs;
}

export function historyImportEnvelopes(slot: number) {
  return historyImportPhases.map((phase) => {
    const identity = { phase, slot };
    return parseJobEnvelope({ version: 1, type, handlerVersion, idempotencyKey: jobFingerprint(identity),
      payload: identity, refresh: null, priority: 0, notBefore: slot, expiresAt: slot + intervalMs,
      maxAttempts: 3, timeoutMs, leaseMs: 30_000, fallbackReserveMs: 0,
      backoff: { baseMs: 60_000, maxMs: 300_000 } });
  });
}

export function createHistoryImportJob({ database, queue, enabled, steps }: Readonly<{
  database: DatabaseRuntime; queue: Pick<JobQueue, "assertOwned">; enabled: boolean;
  steps: Readonly<Partial<Record<HistoryImportPhase, ArchiveStep>>>;
}>) {
  async function record(context: JobHandlerContext, phase: HistoryImportPhase, status: z.infer<typeof historyImportStatus>,
    coverage?: HistoryImportReport["coverage"]) {
    await context.checkpoint();
    await database.transaction(async (tx) => {
      const now = await queue.assertOwned(tx, context.lease);
      const update = { status, updatedAt: new Date(now), ...(coverage && { coverage }) };
      await tx.footballHistoryImportStatus.upsert({ where: { phase }, update,
        create: { phase, ...update, coverage: coverage ?? Prisma.DbNull } });
    });
  }

  return defineJob({ type, handlerVersion, payload, eligible: () => enabled,
    async handle({ phase }, context): Promise<JobOutcome> {
      await record(context, phase, "running");
      const step = steps[phase];
      if (!step) {
        await record(context, phase, "unavailable");
        return { status: "succeeded" };
      }

      let report: HistoryImportReport;
      try { report = await step(context.signal); }
      catch {
        await record(context, phase, "retrying");
        return { status: "failed", reason: "handler-failed", retryable: true };
      }
      const { stopped } = report;
      if (stopped && quotaStops.has(stopped)) {
        await record(context, phase, "waiting-quota", report.coverage);
        return { status: "succeeded" };
      }
      if (stopped && unavailableStops.has(stopped)) {
        await record(context, phase, "unavailable", report.coverage);
        return { status: "succeeded" };
      }
      if (stopped && !plannedStops.has(stopped)) {
        await record(context, phase, "retrying", report.coverage);
        return { status: "failed", reason: "handler-failed", retryable: true };
      }
      await record(context, phase, report.complete ? "caught-up" : "pending", report.coverage);
      return { status: "succeeded" };
    } });
}
