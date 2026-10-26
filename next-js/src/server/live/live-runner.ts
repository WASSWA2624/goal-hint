import "server-only";

import { autoRenewFor } from "../members/auto-renew.ts";
import { membersPurgeFor } from "../members/purge.ts";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { calendarRules } from "../../domain/calendar.ts";
import type { RuntimePolicy } from "../config/runtime-policy.ts";
import { createJobWorker } from "../jobs/job-worker.ts";
import { resultCadence } from "../results/result-sync-policy.ts";
import { dailySelectionEnvelope } from "../selection/selection-trigger.ts";
import { latestOddsSlot, oddsScheduleEnvelopes } from "../odds/odds-jobs.ts";
import { latestTeamCodesSlot, teamCodesEnvelope } from "../teams/team-code-jobs.ts";
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
  let accountCheckedAt = Date.now(), scheduled = 0, pollerCheckedAt = 0, oddsScheduled = 0, teamCodesScheduled = 0;
  type Poller = Readonly<{ controller: AbortController; done: Promise<void>; policy: unknown }>;
  const owned: { poller: Poller | null; details: Poller | null } = { poller: null, details: null };
  const plan = runtime.day.status.plan, dailyLimit = runtime.day.status.dailyLimit;
  try {
    while (!signal.aborted) {
      membersPurgeFor(runtime.database).maybePurge();
      autoRenewFor(runtime.database).maybeSweep();
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
      // Odds: the UTC day's catalog, then one import per EAT date for each 3-hour slot (nearest date first).
      // Durable idempotency keys make restarts, plan rebuilds and a retried tick re-enqueue the same rows.
      if (runtime.odds.enabled) {
        const slot = latestOddsSlot(now);
        if (slot !== oddsScheduled) {
          try {
            const envelopes = oddsScheduleEnvelopes(now, runtime.odds.horizonDays);
            for (const envelope of envelopes) await runtime.queue.enqueue(envelope);
            oddsScheduled = slot; log({ event: "odds-scheduled", slot: new Date(slot).toISOString(), dates: envelopes.length - 1 });
          } catch (error) { log({ event: "odds-schedule-failed", reason: reason(error) }); }
        }
      }
      // Team codes: one sweep per hourly slot, below every odds job on the shared enrichment worker. The durable
      // idempotency key makes restarts and plan rebuilds re-enqueue the same row.
      if (runtime.teamCodes.enabled) {
        const slot = latestTeamCodesSlot(now);
        if (slot !== teamCodesScheduled) {
          try {
            const job = await runtime.queue.enqueue(teamCodesEnvelope(slot));
            teamCodesScheduled = slot; log({ event: "team-codes-scheduled", slot: new Date(slot).toISOString(), state: job.state });
          } catch (error) { log({ event: "team-codes-schedule-failed", reason: reason(error) }); }
        }
      }
      // Write-time staleness (and, without verified display rights, hiding every fresh price) makes no provider
      // calls, so it runs even while imports are off.
      try {
        const expired = await runtime.odds.expire(500);
        if (expired > 0) log({ event: "odds-expired", fixtures: expired });
      } catch (error) { log({ event: "odds-expire-failed", reason: reason(error) }); }
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
        try {
          const current = await runtime.liveMatchPoller();
          if (current?.policy !== owned.details?.policy) {
            if (owned.details) { owned.details.controller.abort(); await owned.details.done; }
            owned.details = null;
            if (current) {
              const controller = new AbortController();
              const done = current.service.run(AbortSignal.any([signal, controller.signal]))
                .catch((error: unknown) => log({ event: "live-details-stopped", reason: reason(error) }));
              owned.details = { controller, done, policy: current.policy };
              log({ event: "live-details-poller", competitions: current.policy.coverage.length,
                intervalMs: current.policy.intervalMs, finalIntervalMs: current.policy.finalIntervalMs });
            }
          }
        } catch (error) { log({ event: "live-details-failed", reason: reason(error) }); }
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
  } finally {
    for (const poller of [owned.poller, owned.details]) poller?.controller.abort();
    await Promise.all([owned.poller?.done, owned.details?.done]);
  }
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
      refreshCapacity: workload.refreshCapacity, workers: workload.workers, liveMs: workload.cadence.liveMs, dateMs: workload.cadence.dateMs,
      // `oddsSwitch` true with `odds` false means the owner enabled imports but this plan is not eligible; the same
      // holds for `teamCodesSwitch` and `teamCodes`, which share the odds spare.
      odds: runtime.odds.enabled, oddsSwitch: policy.choices.odds.enabled, oddsSpare: workload.odds.spare,
      teamCodes: runtime.teamCodes.enabled, teamCodesSwitch: policy.choices.teamCodes.enabled,
      liveDetails: workload.liveDetails.eligible, liveDetailsSwitch: policy.choices.liveDetails.enabled,
      liveDetailsRequests: workload.liveDetails.requests });
    const workers = Array.from({ length: workload.workers }, () => createJobWorker({ queue: runtime.queue, registry: runtime.registry,
      ownerId: randomBytes(32).toString("hex"), onEvent: (event) => {
        if (event.kind !== "claimed") log({ event: `job-${event.kind}`, jobId: event.jobId?.slice(0, 12) ?? null, reason: event.reason });
      } }).run(stop));
    // One dedicated enrichment worker for odds and team codes. It runs even while imports are off so queued jobs drain
    // or expire, one at a time, so the shared spare-quota gate is never checked by two jobs at once. Sweeps are hourly
    // at most, so it polls every 10 seconds when idle instead of every second.
    const enrichmentWorker = createJobWorker({ queue: runtime.queue, registry: runtime.enrichment.registry, ownerId: randomBytes(32).toString("hex"),
      pollMs: 10_000, onEvent: (event) => {
        if (event.kind !== "claimed") log({ event: `enrichment-job-${event.kind}`, jobId: event.jobId?.slice(0, 12) ?? null, reason: event.reason });
      } }).run(stop);
    try {
      await Promise.all([...workers, enrichmentWorker, maintain(runtime, stop, () => epoch.abort(), log).finally(() => epoch.abort())]);
    } finally { await runtime.close().catch(() => {}); }
  }
}
