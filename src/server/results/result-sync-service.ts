import "server-only";

import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow } from "../football/api-football-contract.ts";
import { parseLifecycleInput } from "../predictions/lifecycle-input.ts";
import { historyHash } from "../predictions/history-input.ts";
import { ResultSyncError, resultSyncFail, type PollChannel, type PollLease, type ResultSyncAuthority, type ResultSyncBatch,
  type ResultSyncStore, type TrackedResultFixture } from "./result-sync-contract.ts";
import { failureDelay, parseResultSyncPolicy, pollingInterval, shouldPollLive } from "./result-sync-policy.ts";

export function createResultSyncService(options: Readonly<{
  accountId: string; ownerId?: string; policy: unknown; authority: ResultSyncAuthority; store: ResultSyncStore;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "liveFixtures" | "fixturesByDate" | "unresolvedFixtures">;
  clock?: Clock; onState?: (state: "active" | "idle" | "delayed" | "standby") => void;
}>) {
  const policy = parseResultSyncPolicy(options.policy), policyHash = evidenceFingerprint(policy);
  const accountId = historyHash.parse(options.accountId), ownerId = historyHash.parse(options.ownerId ?? randomBytes(32).toString("hex"));
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, { store, adapter, authority } = options;
  let lease: PollLease | null = null, busy = false, monotonicUntil = 0, delayed = false;
  function authorize() {
    try {
      if (authority.authorize() !== undefined || authority.verifyPolicy(policy) !== true) return resultSyncFail("unauthorized");
    } catch { return resultSyncFail("unauthorized"); }
  }
  const emit = (state: Parameters<NonNullable<typeof options.onState>>[0]) => { try { options.onState?.(state); } catch {} };
  async function renew() {
    authorize();
    if (!lease) return resultSyncFail("lost-lease");
    const start = performance.now();
    lease = await store.renew(lease, policy.leaseMs);
    // Even a frozen/regressed wall clock cannot extend a local dispatch lease.
    monotonicUntil = start + policy.leaseMs;
  }
  async function recover(signal?: AbortSignal) {
    let remaining = policy.maxBatchesPerTick;
    while (remaining > 0 && !signal?.aborted) {
      const batches = await store.pending(lease!);
      if (batches.length === 0) return true;
      for (const batch of batches.slice(0, remaining)) {
        if (signal?.aborted) return false;
        if (batch.policyHash !== policyHash) return resultSyncFail("policy-required");
        await renew(); await store.apply(lease!, batch);
        remaining--;
      }
    }
    return false;
  }
  async function poll(channel: PollChannel, tracked: readonly TrackedResultFixture[], ids: readonly number[], signal?: AbortSignal) {
    await renew();
    const requestedAt = clock.now(), date = channel === "date" ? getReportingDate(requestedAt) : null;
    const cadence = channel === "live" ? 15_000 : 60_000;
    const previousFailures = channel === "live" ? lease!.liveFailures : channel === "date" ? lease!.dateFailures : Math.max(0, ...tracked.map((fixture) => fixture.failures));
    // Reserve the cadence before dispatch; a crash never immediately repeats it.
    if (channel === "ids") await store.attempts(lease!, tracked.map((fixture) => ({ fixtureId: fixture.fixtureId, nextAt: requestedAt + cadence, failures: fixture.failures, error: "request-in-progress" })));
    else await store.schedule(lease!, channel, requestedAt + cadence, previousFailures, "request-in-progress");
    const controller = new AbortController(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(requestedAt + policy.requestWindowMs, lease!.until - policy.tickMs));
    const timer = setTimeout(() => controller.abort(), Math.min(policy.requestWindowMs, Math.max(1, monotonicUntil - performance.now() - policy.tickMs)));
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const check = () => {
      authorize();
      if (requestSignal.aborted || !lease || clock.now() >= deadlineAt || performance.now() >= monotonicUntil - policy.tickMs)
        return resultSyncFail("lost-lease");
    };
    const workflow: ApiFootballFallbackWorkflow = { signal: requestSignal, deadlineAt, check, beforeReserve: check, beforeDispatch: check };
    const hasDueFinals = channel === "date" && tracked.some((fixture) => fixture.firstFinalAt !== null &&
      fixture.kickoffAt !== null && getReportingDate(utcInstantFromEpochMilliseconds(fixture.kickoffAt)) === date &&
      pollingInterval(fixture, policy, requestedAt) !== null);
    const bounds: ApiFootballBounds = { ...policy.request, priority: channel === "ids" || hasDueFinals ? "results-cutoff" : "live-date-sync", deadlineAt };
    let response;
    try {
      check();
      response = await (channel === "live" ? adapter.liveFixtures(bounds, workflow) : channel === "date"
        ? adapter.fixturesByDate(date!, bounds, workflow) : adapter.unresolvedFixtures(ids, bounds, workflow));
    } finally { clearTimeout(timer); }
    let approved = false;
    try { approved = authority.verifyResponse(response) === true; } catch {}
    if (!approved) return resultSyncFail("unauthorized");
    // Unsupported pagination stays explicitly incomplete. Never invent page support.
    const validPages = response.provenance.every((page) => page.provider === "api-football" && page.endpoint === "fixtures" &&
      page.contractVersion === API_FOOTBALL_CONTRACT_VERSION && page.currentPage === 1 && page.totalPages === 1 &&
      page.requestParameters.timezone === "Africa/Kampala" && (channel === "live" ? page.requestParameters.live === "all"
        : channel === "date" ? page.requestParameters.date === date :
          (page.requestParameters.ids ?? page.requestParameters.id ?? "").split("-").every((id) => ids.includes(Number(id)))));
    const byExternalId = new Map(tracked.map((fixture) => [fixture.externalId, fixture]));
    const observations = validPages ? response.data.flatMap((fixture) => {
      const canonical = byExternalId.get(fixture.id);
      if (!canonical || !policy.coverage.some((entry) => entry.competitionId === fixture.competition.id && entry.season === fixture.competition.season)) return [];
      if (channel === "date" && (fixture.kickoff === null || getReportingDate(fixture.kickoff) !== date)) return [];
      if (!response.provenance.some((page) => page.retrievedAt === fixture.source.retrievedAt && page.providerUpdatedAt === fixture.source.providerUpdatedAt)) return [];
      return [parseLifecycleInput({ fixtureId: canonical.fixtureId, fixture, actualStartedAt: null,
        actor: "fixture-result-sync", evidenceRef: policy.evidenceRef })];
    }) : [];
    const error = response.error?.quotaReason ?? response.error?.reason ?? (validPages ? null : "pagination-incomplete");
    const batchValue = { accountId, policyHash, channel, date, requestedIds: ids, observations,
      receivedAt: clock.now(), error, requestsDispatched: response.requestsDispatched };
    const batch: ResultSyncBatch = { id: evidenceFingerprint(batchValue), ...batchValue };
    authorize(); await store.save(lease!, batch); await store.apply(lease!, batch);
    const failures = error ? previousFailures + 1 : 0;
    const delay = error ? Math.max(cadence, failureDelay(policy, failures), response.error?.retryAfterMs ?? 0,
      response.error?.retryAt === undefined ? 0 : response.error.retryAt - clock.now()) : cadence;
    if (channel === "ids") {
      const refreshed = new Set(observations.map((observation) => observation.externalFixtureId));
      await store.attempts(lease!, tracked.map((fixture) => ({ fixtureId: fixture.fixtureId,
        nextAt: clock.now() + (refreshed.has(fixture.externalId) ? pollingInterval(fixture, policy, clock.now()) ?? delay : delay),
        failures: refreshed.has(fixture.externalId) ? 0 : failures || fixture.failures + 1,
        error: refreshed.has(fixture.externalId) ? null : error ?? "missing-provider-fixture" })));
    } else await store.schedule(lease!, channel, clock.now() + delay, failures, error);
    if (error) { delayed = true; emit("delayed"); }
  }
  async function runOnce(signal?: AbortSignal): Promise<boolean> {
    if (busy || signal?.aborted) return false;
    busy = true; delayed = false;
    try {
      authorize();
      if (lease && lease.until <= clock.now()) lease = null;
      if (!lease) lease = await store.acquire(ownerId, policy.leaseMs);
      if (!lease) { emit("standby"); return false; }
      await renew();
      if (!await recover(signal)) { emit("delayed"); return true; }
      let fixtures = await store.tracked(policy, clock.now());
      let remainingBatches = policy.maxBatchesPerTick;
      // Historical finals cannot be found in today's response. Give their
      // essential checks the first slots before optional live/date work.
      const urgent = fixtures.filter((fixture) => {
        const interval = pollingInterval(fixture, policy, clock.now());
        return fixture.firstFinalAt !== null && interval !== null && (fixture.nextCheckAt === null || fixture.nextCheckAt <= clock.now()) &&
          clock.now() - Math.max(fixture.retrievedAt, fixture.lastSyncAt ?? 0) >= interval &&
          (lease!.nextDateAt > clock.now() || fixture.kickoffAt === null ||
            getReportingDate(utcInstantFromEpochMilliseconds(fixture.kickoffAt)) !== getReportingDate(clock.now()));
      }).sort((a, b) => Math.max(a.retrievedAt, a.lastSyncAt ?? 0) - Math.max(b.retrievedAt, b.lastSyncAt ?? 0) || a.externalId - b.externalId);
      for (let offset = 0; offset < urgent.length && remainingBatches > 0; offset += 20, remainingBatches--) {
        const group = urgent.slice(offset, offset + 20); await poll("ids", group, group.map((fixture) => fixture.externalId), signal);
      }
      if (urgent.length) fixtures = await store.tracked(policy, clock.now());
      if (lease!.nextDateAt <= clock.now()) {
        await poll("date", fixtures, [], signal); fixtures = await store.tracked(policy, clock.now());
      }
      const live = shouldPollLive(fixtures, policy, clock.now());
      if (live && lease!.nextLiveAt <= clock.now()) {
        await poll("live", fixtures, [], signal); fixtures = await store.tracked(policy, clock.now());
      }
      const due = fixtures.filter((fixture) => {
        const interval = pollingInterval(fixture, policy, clock.now());
        return interval !== null && (fixture.nextCheckAt === null || fixture.nextCheckAt <= clock.now()) &&
          clock.now() - Math.max(fixture.retrievedAt, fixture.lastSyncAt ?? 0) >= interval;
      }).sort((a, b) => (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0) ||
        Math.max(a.retrievedAt, a.lastSyncAt ?? 0) - Math.max(b.retrievedAt, b.lastSyncAt ?? 0) || a.externalId - b.externalId);
      const exhausted = fixtures.filter((fixture) => fixture.nextCheckAt !== null && pollingInterval(fixture, policy, clock.now()) === null &&
        (fixture.firstFinalAt !== null || clock.now() - (fixture.kickoffAt ?? fixture.firstTrackedAt) >= policy.activeWindowMs));
      if (exhausted.length) await store.attempts(lease!, exhausted.map((fixture) => ({ fixtureId: fixture.fixtureId,
        nextAt: null, failures: fixture.failures, error: "polling-horizon-exhausted" })));
      for (let offset = 0; offset < Math.min(due.length, 20 * remainingBatches); offset += 20) {
        const group = due.slice(offset, offset + 20);
        await poll("ids", group, group.map((fixture) => fixture.externalId), signal);
      }
      emit(delayed ? "delayed" : live ? "active" : "idle"); return true;
    } catch (error) {
      lease = null; emit("delayed");
      if (signal?.aborted) return false;
      if (error instanceof ResultSyncError && error.reason === "unauthorized") throw error;
      return false;
    } finally { busy = false; }
  }
  async function stop() { const previous = lease; lease = null; if (previous) await store.release(previous); }
  return Object.freeze({ runOnce, stop, async run(signal: AbortSignal) {
    try {
      while (!signal.aborted) {
        await runOnce(signal);
        if (!signal.aborted) await sleep(policy.tickMs, undefined, { signal }).catch(() => {});
      }
    } finally { await stop(); }
  } });
}
