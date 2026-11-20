import "server-only";

import { autoRenewFor } from "../members/auto-renew.ts";
import { accountNotificationsFor } from "../members/account-notifications.ts";
import { membersPurgeFor } from "../members/purge.ts";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { calendarRules } from "../../domain/calendar.ts";
import type { RuntimePolicy } from "../config/runtime-policy.ts";
import { historyImportEnvelopes, latestHistoryImportSlot } from "../football/history-import-jobs.ts";
import { currentDayContextEnvelope, footballRefreshCadence } from "../football/current-day-refresh.ts";
import { createJobRegistry } from "../jobs/job-registry.ts";
import { createJobWorker } from "../jobs/job-worker.ts";
import { resultCadence } from "../results/result-sync-policy.ts";
import { DAILY_SELECTION_TYPE, dailySelectionEnvelope, HOURLY_SELECTION_TYPE, hourlySelectionEnvelope, latestHourlySelectionOccurrence } from "../selection/selection-trigger.ts";
import { latestOddsSlot, oddsHistoryScheduleEnvelopes, oddsScheduleEnvelopes, ODDS_SWEEP_MS } from "../odds/odds-jobs.ts";
import { latestTeamCodesSlot, teamCodesEnvelope, TEAM_CODES_SLOT_MS } from "../teams/team-code-jobs.ts";
import { LiveAccountError } from "./live-account.ts";
import { FORECAST_RECOVERY_INTERVAL_MS } from "../refresh/forecast-orchestration.ts";
import { assessLiveCapacity, LIVE_REFRESH_TYPE, selectionTriggerBounds } from "./live-plan.ts";
import { createLiveRuntime, LiveConfigurationError, type LiveRuntime } from "./live-runtime.ts";

const MINUTE = 60_000, DAY = 86_400_000;
const MAINTENANCE_INTERVAL_MS = 30_000, POLLER_REVIEW_MS = 5 * MINUTE;
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

/** Maintenance cadence: provider-day rollover, fixture selection schedules, result
 * polling ownership, settlement and cache recovery. Visitor requests trigger none of it. */
async function maintain(runtime: LiveRuntime, signal: AbortSignal, rebuild: () => void, log: (event: LiveEvent) => void,
  localFootball: boolean) {
  let accountCheckedAt = Date.now(), scheduled = 0, pollerCheckedAt = 0, oddsScheduled = 0, teamCodesScheduled = 0;
  let heartbeatAt = 0;
  let quotaObservation: Readonly<{ periodId: string; at: number; remaining: number; used: number }> | null = null;
  let hourlyScheduled: number | null = null, historyScheduled = 0;
  let currentDayScheduled = -1, recoveredForecastSlot = -1;
  let historicalOddsScheduled = -1;
  let capacity: ReturnType<typeof assessLiveCapacity> | null = null, capacityWarning: string | null = null;
  type Poller = Readonly<{ controller: AbortController; done: Promise<void>; policy: unknown }>;
  const owned: { poller: Poller | null; details: Poller | null } = { poller: null, details: null };
  const plan = runtime.day.status.plan, dailyLimit = runtime.day.status.dailyLimit;
  try {
    while (!signal.aborted) {
      if (!localFootball) {
        membersPurgeFor(runtime.database).maybePurge();
        autoRenewFor(runtime.database).maybeSweep();
        accountNotificationsFor(runtime.database).maybeSweep();
      }
      const now = Date.now(), day = runtime.quota.current();
      if (!day || now - accountCheckedAt >= 10 * MINUTE) {
        try {
          const next = await runtime.quota.refresh(); accountCheckedAt = now;
          if (next.periodId !== day?.periodId) log({ event: "provider-day", plan: next.status.plan, dailyLimit: next.status.dailyLimit,
            usedToday: next.status.usedToday });
          // A plan change resizes the whole workload from the new verified limits.
          if (next.status.plan !== plan || next.status.dailyLimit !== dailyLimit ||
            next.status.minuteLimit !== runtime.day.status.minuteLimit || next.status.shortWindowKnown !== runtime.day.status.shortWindowKnown) {
            log({ event: "plan-changed", from: plan, to: next.status.plan, dailyLimit: next.status.dailyLimit }); rebuild(); return;
          }
        } catch (error) { if (reason(error) !== "settling") log({ event: "account-check-failed", reason: reason(error) }); }
      }
      if (now - pollerCheckedAt >= POLLER_REVIEW_MS) {
        try {
          const counters = await runtime.quota.counters();
          quotaObservation = counters ? { periodId: counters.day.periodId, at: now, remaining: counters.remaining, used: counters.used } : null;
          if (counters) {
            capacity = assessLiveCapacity(runtime.workload, counters.day.endsAt - now, counters.day.status.dailyLimit,
              counters.remaining, counters.minuteLimit);
            const { cadence, reserve, critical, criticalShortfall, archiveAllowed, enrichmentMultiplier } = capacity;
            if (!archiveAllowed || counters.singleConcurrent) {
              const warning = [counters.singleConcurrent, counters.minuteLimit, cadence.liveMs, cadence.dateMs, criticalShortfall].join(":");
              if (capacityWarning !== warning) log({ event: "capacity-warning", quotaLimitsUnknown: counters.singleConcurrent,
                minuteLimit: counters.minuteLimit, remaining: counters.remaining, criticalRequests: critical, reserve,
                backfillPaused: !archiveAllowed, enrichmentMultiplier, liveMs: cadence.liveMs, dateMs: cadence.dateMs, criticalShortfall });
              capacityWarning = warning;
            } else if (capacityWarning !== null) {
              capacityWarning = null;
              log({ event: "capacity-recovered", remaining: counters.remaining, reserve, liveMs: cadence.liveMs });
            }
          }
        } catch (error) { log({ event: "capacity-check-failed", reason: reason(error) }); }
      }
      const enrichmentMultiplier = capacity?.enrichmentMultiplier ?? 1;
      const occurrence = latestSelectionOccurrence(now);
      if (occurrence !== scheduled) {
        try {
          const job = await runtime.queue.enqueue(dailySelectionEnvelope(occurrence, selectionTriggerBounds));
          scheduled = occurrence; log({ event: "selection-scheduled", scheduledFor: new Date(occurrence).toISOString(), state: job.state });
        } catch (error) { log({ event: "selection-schedule-failed", reason: reason(error) }); }
      }
      if (runtime.hourlySelectionEnabled) {
        const slot = latestHourlySelectionOccurrence(now);
        if (slot !== null && slot !== hourlyScheduled) {
          try {
            const job = await runtime.queue.enqueue(hourlySelectionEnvelope(slot, selectionTriggerBounds));
            hourlyScheduled = slot;
            log({ event: "hourly-selection-scheduled", scheduledFor: new Date(slot).toISOString(), state: job.state });
          } catch (error) { log({ event: "hourly-selection-schedule-failed", reason: reason(error) }); }
        }
      }
      if (runtime.currentDayContextEnabled) {
        const interval = footballRefreshCadence.currentDay;
        const slot = Math.floor(now / interval) * interval;
        if (slot !== currentDayScheduled && slot % (interval * enrichmentMultiplier) === 0) {
          try {
            const job = await runtime.queue.enqueue(currentDayContextEnvelope(slot));
            currentDayScheduled = slot;
            log({ event: "current-context-scheduled", scheduledFor: new Date(slot).toISOString(), state: job.state });
          } catch (error) { log({ event: "current-context-schedule-failed", reason: reason(error) }); }
        }
      }
      if (runtime.forecastRecovery) {
        const slot = Math.floor(now / FORECAST_RECOVERY_INTERVAL_MS);
        if (slot !== recoveredForecastSlot) try {
          const report = await runtime.forecastRecovery.run();
            if (!report.hasMore || report.restored + report.retried + report.completed === 0) recoveredForecastSlot = slot;
          log({ event: "forecast-recovery", ...report });
        } catch (error) { log({ event: "forecast-recovery-failed", reason: reason(error) }); }
      }
      // Odds: the UTC day's catalog, then one import per EAT date for each 3-hour slot (nearest date first).
      // Durable idempotency keys make restarts, plan rebuilds and a retried tick re-enqueue the same rows.
      if (runtime.odds.enabled) {
        const slot = latestOddsSlot(now);
        if (slot !== oddsScheduled && slot % (ODDS_SWEEP_MS * enrichmentMultiplier) === 0) {
          try {
            const envelopes = oddsScheduleEnvelopes(now, runtime.odds.horizonDays, runtime.odds.bookmakerScope,
              runtime.odds.recoveryEnabled ? { providerLookahead: true } : undefined);
            for (const envelope of envelopes) await runtime.queue.enqueue(envelope);
            oddsScheduled = slot; log({ event: "odds-scheduled", slot: new Date(slot).toISOString(), dates: envelopes.length - 1 });
          } catch (error) { log({ event: "odds-schedule-failed", reason: reason(error) }); }
          if (runtime.coordinated && oddsScheduled === slot) try {
            const coverage = await runtime.odds.catalogCoverage(now);
            if (coverage) {
              const counts = { mapped: 0, unmapped: 0, unsupported: 0 };
              for (const { status } of coverage.entries) counts[status]++;
              log({ event: "pre-match-catalog-coverage", observedAt: new Date(coverage.observedAt).toISOString(), ...counts });
            }
          } catch (error) { log({ event: "pre-match-catalog-coverage-unavailable", reason: reason(error) }); }
        }
        if (runtime.odds.recoveryEnabled && slot !== historicalOddsScheduled && oddsScheduled === slot) {
          try {
            for (const envelope of oddsHistoryScheduleEnvelopes(now)) await runtime.queue.enqueue(envelope);
            historicalOddsScheduled = slot;
          } catch (error) { log({ event: "historical-odds-schedule-failed", reason: reason(error) }); }
        }
      }
      // Team codes: one sweep per hourly slot, below every odds job on the shared enrichment worker. The durable
      // idempotency key makes restarts and plan rebuilds re-enqueue the same row.
      if (runtime.teamCodes.enabled) {
        const slot = latestTeamCodesSlot(now);
        if (slot !== teamCodesScheduled && slot % (TEAM_CODES_SLOT_MS * enrichmentMultiplier) === 0) {
          try {
            const job = await runtime.queue.enqueue(teamCodesEnvelope(slot));
            teamCodesScheduled = slot; log({ event: "team-codes-scheduled", slot: new Date(slot).toISOString(), state: job.state });
          } catch (error) { log({ event: "team-codes-schedule-failed", reason: reason(error) }); }
        }
      }
      if (runtime.enrichment.historyEnabled && capacity?.archiveAllowed !== false) {
        const slot = latestHistoryImportSlot(now);
        if (slot !== historyScheduled) {
          try {
            for (const envelope of historyImportEnvelopes(slot, { includeReference: true })) await runtime.queue.enqueue(envelope);
            historyScheduled = slot;
          } catch (error) { log({ event: "football-history-schedule-failed", reason: reason(error) }); }
        }
      }
      // Write-time staleness (and, without verified display rights, hiding every fresh price) makes no provider
      // calls, so it runs even while imports are off.
      try {
        const expired = await runtime.odds.expire(500);
        if (expired > 0) log({ event: "odds-expired", fixtures: expired });
      } catch (error) { log({ event: "odds-expire-failed", reason: reason(error) }); }
      try {
        const inPlay = Math.floor(now / MAINTENANCE_INTERVAL_MS) % enrichmentMultiplier === 0 ? await runtime.inPlayOdds?.poll() : null;
        if (inPlay && (inPlay.requests > 0 || inPlay.changed > 0)) log({ event: "in-play-odds", ...inPlay });
      } catch (error) { log({ event: "in-play-odds-failed", reason: reason(error) }); }
      if (now - pollerCheckedAt >= POLLER_REVIEW_MS) {
        pollerCheckedAt = now;
        try {
          const current = await runtime.resultPoller(capacity?.cadence);
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
          const current = await runtime.liveMatchPoller(enrichmentMultiplier);
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
      const finishedAt = Date.now();
      if (finishedAt - heartbeatAt >= POLLER_REVIEW_MS) {
        heartbeatAt = finishedAt;
        const activeDay = runtime.quota.current();
        const quota = activeDay?.periodId === quotaObservation?.periodId ? quotaObservation : null;
        const oddsCadence = ODDS_SWEEP_MS * enrichmentMultiplier;
        log({ event: "football-worker-heartbeat", at: finishedAt, coordinated: runtime.coordinated,
          maintenanceMs: Math.max(0, finishedAt - now), nextDailySelectionAt: latestSelectionOccurrence(finishedAt) + DAY,
          nextOddsSweepAt: runtime.odds.enabled ? (Math.floor(finishedAt / oddsCadence) + 1) * oddsCadence : null,
          resultPollerAttached: owned.poller !== null, liveDetailPollerAttached: owned.details !== null,
          providerQuotaObservedAt: quota?.at ?? null, providerDayResetAt: activeDay?.endsAt ?? null,
          quotaUsed: quota?.used ?? null, quotaRemaining: quota?.remaining ?? null,
          estimatedReserve: quota ? capacity?.reserve ?? null : null });
      }
      await pause(MAINTENANCE_INTERVAL_MS, signal);
    }
  } finally {
    for (const poller of [owned.poller, owned.details]) poller?.controller.abort();
    await Promise.all([owned.poller?.done, owned.details?.done]);
  }
}

/** Long-lived private process: one per shared provider account. */
export async function runLive(policy: RuntimePolicy, signal: AbortSignal, log: (event: LiveEvent) => void,
  { localFootball = false }: { localFootball?: boolean } = {}) {
  while (!signal.aborted) {
    let runtime: LiveRuntime;
    const pollerStates = new Map<string, string>();
    try { runtime = await createLiveRuntime(policy, { localFootball,
      onHistoryDetailBatch: (report) => log({ event: "history-detail-batch", ...report }),
      onHourlyLookupFailure: (reason, fixtureCount) => log({ event: "hourly-fixture-reconcile-failed", reason, fixtureCount }),
      onForwardFixtureSweep: (report) => log({ event: "hourly-fixture-forward-sweep", ...report }),
      onHistoricalOdds: (date, summary, state) => {
        if (state === "stored") return;
        const unavailable = summary ? summary.outcomes["unknown-fixture"] + summary.outcomes["awaiting-start"] +
          summary.outcomes["kickoff-mismatch"] + summary.outcomes.skipped : 0;
        log({ event: "historical-pre-match-odds", date, state, status: summary?.status ?? null,
          requests: summary?.requestsDispatched ?? 0, recovered: summary?.outcomes.recover ?? 0,
          changed: summary?.outcomes.changed ?? 0, unavailable,
          reason: summary?.error?.reason ?? (summary?.status === "complete" && summary.outcomes.recover === 0 && unavailable === 0
            ? "no-provider-odds" : state === "deferred" ? "shared-quota" : null) });
      },
      onDateImportFailure: (date, hourly, reason) => log({ event: "selection-date-import-failed", date, hourly, reason }),
      onCurrentDayCoverage: (report) => log({ event: "current-context", requested: report.requested,
        archived: report.archived, skipped: report.skipped, deferred: report.deferred, stopped: report.stopped }),
      ...(localFootball || policy.choices.coordinatedFootball.enabled ? { onPollerState: (kind, state) => {
      if (pollerStates.get(kind) === state) return;
      pollerStates.set(kind, state);
      log({ event: "poller-state", kind, state });
    } } : {}) }); }
    catch (error) {
      if (error instanceof LiveConfigurationError) throw error;
      const why = reason(error);
      if (why === "credential-failure" || why === "subscription-expired" || why === "subscription-inactive") throw error;
      log({ event: "start-delayed", reason: why }); await pause(why === "settling" ? 30_000 : MINUTE, signal); continue;
    }
    const epoch = new AbortController(), stop = AbortSignal.any([signal, epoch.signal]), { workload } = runtime;
    // The snapshot uses the same local MySQL server for reads, collection and publication.
    // Bound background claim concurrency so browsing can share it during a large catch-up.
    const workersPerRun = localFootball ? Math.min(2, workload.workers) : workload.workers;
    log({ event: "ready", plan: runtime.day.status.plan, dailyLimit: workload.dailyLimit, usedToday: runtime.day.status.usedToday,
      refreshCapacity: workload.refreshCapacity, workers: runtime.coordinated ? runtime.forecastConcurrency + 2 : workersPerRun,
      forecastConcurrency: runtime.coordinated ? runtime.forecastConcurrency : null, liveMs: workload.cadence.liveMs, dateMs: workload.cadence.dateMs,
      // `oddsSwitch` true with `odds` false means the owner enabled imports but this plan is not eligible; the same
      // holds for `teamCodesSwitch` and `teamCodes`, which share the odds spare.
      odds: runtime.odds.enabled, oddsSwitch: policy.choices.odds.enabled, oddsSpare: workload.odds.spare,
      teamCodes: runtime.teamCodes.enabled, teamCodesSwitch: policy.choices.teamCodes.enabled,
      liveDetails: workload.liveDetails.eligible, liveDetailsSwitch: policy.choices.liveDetails.enabled,
      liveDetailsRequests: workload.liveDetails.requests, historyImport: runtime.enrichment.historyEnabled });
    let selectionRegistry = runtime.registry, refreshAndCutoffRegistry = runtime.registry;
    if (!localFootball && workersPerRun > 1) {
      // Reserve a worker so an older refresh backlog cannot delay fixture imports.
      const definitions = runtime.registry.types.map(({ type, handlerVersion }) => runtime.registry.find(type, handlerVersion)!);
      const selectionTypes = new Set<string>([DAILY_SELECTION_TYPE, HOURLY_SELECTION_TYPE]);
      selectionRegistry = createJobRegistry(definitions.filter((definition) => selectionTypes.has(definition.type)));
      refreshAndCutoffRegistry = createJobRegistry(definitions.filter((definition) => !selectionTypes.has(definition.type)));
    }
    let workerRegistries = Array.from({ length: workersPerRun }, (_, index) => index === 0 ? selectionRegistry : refreshAndCutoffRegistry);
    if (runtime.coordinated) {
      const definitions = runtime.registry.types.map(({ type, handlerVersion }) => runtime.registry.find(type, handlerVersion)!);
      const isSelection = (type: string) => type === DAILY_SELECTION_TYPE || type === HOURLY_SELECTION_TYPE;
      const forecast = createJobRegistry(definitions.filter(({ type }) => type === LIVE_REFRESH_TYPE));
      const schedules = createJobRegistry(definitions.filter(({ type }) => isSelection(type)));
      const cutoff = createJobRegistry(definitions.filter(({ type }) => !isSelection(type) && type !== LIVE_REFRESH_TYPE));
      workerRegistries = [schedules, cutoff, ...Array.from({ length: runtime.forecastConcurrency }, () => forecast)];
    }
    const workers = workerRegistries.map(registry => createJobWorker({
      queue: runtime.queue, registry,
      ownerId: randomBytes(32).toString("hex"), onEvent: (event) => {
        if (event.kind !== "claimed") log({ event: `job-${event.kind}`, jobId: event.jobId?.slice(0, 12) ?? null, reason: event.reason });
      } }).run(stop));
    // One dedicated enrichment worker for odds, team codes and history. It runs even while imports are off so queued jobs drain
    // or expire, one at a time, so the shared spare-quota gate is never checked by two jobs at once. Sweeps are hourly
    // at most, so it polls every 10 seconds when idle instead of every second.
    const enrichmentWorker = createJobWorker({ queue: runtime.queue, registry: runtime.enrichment.registry, ownerId: randomBytes(32).toString("hex"),
      pollMs: 10_000, onEvent: (event) => {
        if (event.kind !== "claimed") log({ event: `enrichment-job-${event.kind}`, jobId: event.jobId?.slice(0, 12) ?? null, reason: event.reason });
      } }).run(stop);
    const storedOdds = runtime.odds.projectAuthorizedStored().then((result) => {
      if (result) log({ event: "odds-retained-projected", ...result });
    }, (error) => log({ event: "odds-retained-projection-failed", reason: reason(error) }));
    try {
      await Promise.all([...workers, enrichmentWorker, storedOdds,
        maintain(runtime, stop, () => epoch.abort(), log, localFootball).finally(() => epoch.abort())]);
    } finally { await runtime.close().catch(() => {}); }
  }
}
