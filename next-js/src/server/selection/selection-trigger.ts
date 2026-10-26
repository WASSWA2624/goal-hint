import "server-only";

import { calendarRules } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { JobEnvelope, JobQueue } from "../jobs/job-contract.ts";
import { parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob } from "../jobs/job-registry.ts";
import { readPrivateJobBody, type JobTriggerIdentity } from "../jobs/job-trigger.ts";
import { DailySelectionError } from "./selection-contract.ts";
import { parseSelection, scheduledSelection, selectionWindow } from "./selection-input.ts";
import type { createDailySelectionService } from "./selection-service.ts";

export const dailySelectionSchedule = Object.freeze({ timeZone: "UTC", cron: calendarRules.dailyRunUtcCron,
  reportingTimeZone: "Africa/Kampala", reportingTime: calendarRules.dailyRunTime });

/** Register only after the host has approved workload identity, policy and bounds. */
export function defineDailySelectionJob(service: ReturnType<typeof createDailySelectionService>) {
  return defineJob({ type: "daily.selection", handlerVersion: 1, payload: scheduledSelection,
    async handle(payload, context) {
      await context.checkpoint();
      try {
        const result = await service.run(payload.scheduledFor, undefined, context.signal);
        await context.checkpoint();
        return result.status === "busy" ? { status: "failed", reason: "handler-failed", retryable: true } : { status: "succeeded" };
      } catch (error) {
        return { status: "failed", reason: "handler-failed", retryable: error instanceof DailySelectionError &&
          ["incomplete-import", "lost-lease", "unavailable"].includes(error.reason) };
      }
    } });
}

export type DailySelectionBounds = Pick<JobEnvelope, "maxAttempts" | "timeoutMs" | "leaseMs" | "fallbackReserveMs" | "backoff"> &
  Readonly<{ expiresAfterMs: number }>;
/** The one durable envelope per EAT run date, shared by HTTP and in-process schedulers. */
export function dailySelectionEnvelope(scheduledFor: unknown, input: DailySelectionBounds): JobEnvelope {
  const payload = parseSelection(scheduledSelection, { scheduledFor }), window = selectionWindow(payload.scheduledFor);
  const { expiresAfterMs, ...bounds } = input;
  if (!Number.isSafeInteger(expiresAfterMs) || expiresAfterMs <= 0 || payload.scheduledFor + expiresAfterMs > window.endExclusive) throw new Error();
  return parseJobEnvelope({ ...bounds, version: 1, type: "daily.selection", handlerVersion: 1,
    idempotencyKey: evidenceFingerprint({ type: "daily.selection", runDate: window.runDate }), payload, refresh: null,
    notBefore: window.startInclusive, expiresAt: window.startInclusive + expiresAfterMs, priority: 0 });
}
/** The scheduler supplies its original occurrence, retained through every retry.
 * This protected adapter enqueues bounded durable work and does no provider I/O. */
export function createDailySelectionTrigger(input: Readonly<{
  identity: JobTriggerIdentity; queue: JobQueue; bounds: DailySelectionBounds;
}>) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    try { if (await input.identity.authorize(request) !== true) return Response.json({ error: "unauthorized" }, { status: 401, headers }); }
    catch { return Response.json({ error: "unauthorized" }, { status: 401, headers }); }
    if (request.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405, headers: { ...headers, Allow: "POST" } });
    let envelope;
    try {
      const body = parseSelection(scheduledSelection, await readPrivateJobBody(request));
      envelope = dailySelectionEnvelope(body.scheduledFor, input.bounds);
    } catch { return Response.json({ error: "invalid-request" }, { status: 400, headers }); }
    try {
      const job = await input.queue.enqueue(envelope);
      return Response.json({ jobId: job.id, state: job.state }, { status: 202, headers });
    } catch { return Response.json({ error: "unavailable" }, { status: 503, headers }); }
  };
}
