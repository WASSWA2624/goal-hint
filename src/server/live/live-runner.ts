import "server-only";

import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { calendarRules } from "../../domain/calendar.ts";
import type { RuntimePolicy } from "../config/runtime-policy.ts";
import { createJobWorker } from "../jobs/job-worker.ts";
import { resultCadence } from "../results/result-sync-policy.ts";
import { dailySelectionEnvelope } from "../selection/selection-trigger.ts";
import { LiveAccountError } from "./live-account.ts";
import { selectionTriggerBounds } from "./live-plan.ts";
import { createLiveRuntime, LiveConfigurationError, type LiveRuntime } from "./live-runtime.ts";

const MINUTE = 60_000, DAY = 86_400_000;
const [runHour = 21, runMinute = 0] = calendarRules.dailyRunUtcCron.split(" ").slice(0, 2).reverse().map(Number);
const RUN_OFFSET = runHour * 3_600_000 + runMinute * MINUTE;
export type LiveEvent = Readonly<Record<string, string | number | boolean | null>>;
/** The most recent 00:00 EAT selection occurrence (21:00 UTC) at or before now. */
export function latestSelectionOccurrence(now: number): number {
  return Math.floor((now - RUN_OFFSET) / DAY) * DAY + RUN_OFFSET;
}
const reason = (error: unknown) => error instanceof LiveAccountError ? error.reason
  : error instanceof Error && "reason" in error && typeof error.reason === "string" ? error.reason : "unavailable";
async function pause(ms: number, signal: AbortSignal) { await sleep(ms, undefined, { signal }).catch(() => {}); }

/** Maintenance cadence: provider-day rollover, the daily selection schedule, result
 * polling ownership, settlement and cache recovery. Visitor requests trigger none of it. */
async function maintain(runtime: LiveRuntime, signal: AbortSignal, rebuild: () => void, log: (event: LiveEvent) => void) {
  let accountCheckedAt = Date.now(), scheduled = 0, pollerCheckedAt = 0;
  type Poller = Readonly<{ controller: AbortController; done: Promise<void>; policy: unknown }>;
  const owned: { poller: Poller | null } = { poller: null };
  const plan = runtime.day.status.plan, dailyLimit = runtime.day.status.dailyLimit;
  try {
    while (!signal.aborted) {
      const now = Date.now(), day = runtime.quota.current();
      if (!day || now - accountCheckedAt >= 10 * MINUTE) {
        try {
          const next = await runtime.quota.refresh(); accountCheckedAt = now;
          if (next.periodId !== day?.periodId) log({ event: "provider-day", plan: next.status.plan, dailyLimit: next.status.dailyLimit,
            usedToday: next.status.usedToday });
          // A plan change resizes the whole workload from the new verified limits.
          if (next.status.plan !== plan || next.status.dailyLimit !== dailyLimit) {
            log({ event: "plan-changed", from: plan, to: next.status.plan, dailyLimit: next.status.dailyLimit }); rebuild(); return;
          }
        } catch (error) { if (reason(error) !== "settling") log({ event: "account-check-failed", reason: reason(error) }); }
      }
      const occurrence = latestSelectionOccurrence(now);
      if (occurrence !== scheduled) {
        try {
          const job = await runtime.queue.enqueue(dailySelectionEnvelope(occurrence, selectionTriggerBounds));
          scheduled = occurrence; log({ event: "selection-scheduled", scheduledFor: new Date(occurrence).toISOString(), state: job.state });
        } catch (error) { log({ event: "selection-schedule-failed", reason: reason(error) }); }
      }
      if (now - pollerCheckedAt >= 5 * MINUTE) {
        pollerCheckedAt = now;
        try {
          const current = await runtime.resultPoller();
          if (current?.policy !== owned.poller?.policy) {
            if (owned.poller) { owned.poller.controller.abort(); await owned.poller.done; }
            owned.poller = null;
            if (current) {
              const controller = new AbortController();
              const done: Promise<void> = current.service.run(AbortSignal.any([signal, controller.signal]))
                .catch((error: unknown) => log({ event: "result-poller-stopped", reason: reason(error) }));
              owned.poller = { controller, done, policy: current.policy };
              const cadence = resultCadence(current.policy);
              log({ event: "result-poller", competitions: current.policy.coverage.length, liveMs: cadence.liveMs, dateMs: cadence.dateMs });
            }
          }
        } catch (error) { log({ event: "result-poller-failed", reason: reason(error) }); }
      }
      try {
        let settled = 0;
        for (let batch = 0; batch < 10; batch++) {
          const receipts = await runtime.settlement.reconcile(100); settled += receipts.length;
          if (receipts.length < 100) break;
        }
        if (settled > 0) log({ event: "settled", fixtures: settled });
      } catch (error) { log({ event: "settlement-failed", reason: reason(error) }); }
      try { await runtime.cache.reconcile(100); } catch (error) { log({ event: "cache-reconcile-failed", reason: reason(error) }); }
      await pause(30_000, signal);
    }
  } finally { if (owned.poller) { owned.poller.controller.abort(); await owned.poller.done; } }
}

/** Long-lived private process: one per shared provider account. */
export async function runLive(policy: RuntimePolicy, signal: AbortSignal, log: (event: LiveEvent) => void) {
  while (!signal.aborted) {
    let runtime: LiveRuntime;
    try { runtime = await createLiveRuntime(policy); }
    catch (error) {
      if (error instanceof LiveConfigurationError) throw error;
      const why = reason(error);
      if (why === "credential-failure" || why === "subscription-expired" || why === "subscription-inactive") throw error;
      log({ event: "start-delayed", reason: why }); await pause(why === "settling" ? 30_000 : MINUTE, signal); continue;
    }
    const epoch = new AbortController(), stop = AbortSignal.any([signal, epoch.signal]), { workload } = runtime;
    log({ event: "ready", plan: runtime.day.status.plan, dailyLimit: workload.dailyLimit, usedToday: runtime.day.status.usedToday,
      refreshCapacity: workload.refreshCapacity, workers: workload.workers, liveMs: workload.cadence.liveMs, dateMs: workload.cadence.dateMs });
    const workers = Array.from({ length: workload.workers }, () => createJobWorker({ queue: runtime.queue, registry: runtime.registry,
      ownerId: randomBytes(32).toString("hex"), onEvent: (event) => {
        if (event.kind !== "claimed") log({ event: `job-${event.kind}`, jobId: event.jobId?.slice(0, 12) ?? null, reason: event.reason });
      } }).run(stop));
    try {
      await Promise.all([...workers, maintain(runtime, stop, () => epoch.abort(), log).finally(() => epoch.abort())]);
    } finally { await runtime.close().catch(() => {}); }
  }
}
