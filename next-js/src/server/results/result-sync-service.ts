import "server-only";

import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixture } from "../football/api-football-normalize.ts";
import { parseLifecycleInput } from "../predictions/lifecycle-input.ts";
import { historyHash } from "../predictions/history-input.ts";
import { ResultSyncError, resultSyncFail, type PollChannel, type PollLease, type ResultSyncAuthority, type ResultSyncBatch,
  type ResultSyncStore, type TrackedResultFixture } from "./result-sync-contract.ts";
import { coordinatedResultDefaults, failureDelay, finalStatus, liveDiscoveryInterval, missingFromLiveFeed, nextLiveCheckAfterDate, parseResultSyncPolicy,
  pollingInterval, requiresResultInvestigation, resultCadence, sharedLiveFixtures, unresolvedInvestigation } from "./result-sync-policy.ts";

export function createResultSyncService(options: Readonly<{
  accountId: string; ownerId?: string; policy: unknown; authority: ResultSyncAuthority; store: ResultSyncStore;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "liveFixtures" | "fixturesByDate" | "unresolvedFixtures">;
  /** Reconcile unknown canonical identities using the already-counted broad response. */
  onDiscoveredFixtures?: (response: ApiFootballResult<NormalizedFixture>, context: Readonly<{
    channel: "live" | "date"; unknownIds: readonly number[]; signal?: AbortSignal;
  }>) => Promise<void>;
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
        // Empty failure receipts have no fixture writes to authorize. Close the
        // sealed receipt even if coverage changed while the poll was in flight.
        if (batch.policyHash !== policyHash && (batch.observations.length > 0 || batch.missingLiveFixtures?.length) && authority.verifyRecovery?.(batch, policy) !== true)
          return resultSyncFail("policy-required");
        await renew(); await store.apply(lease!, batch);
        remaining--;
      }
    }
    return false;
  }
  async function poll(channel: PollChannel, tracked: readonly TrackedResultFixture[], ids: readonly number[], signal?: AbortSignal) {
    await renew();
    const requestedAt = clock.now(), date = channel === "date" ? getReportingDate(requestedAt) : null;
    const { liveMs, dateMs, activeMs } = resultCadence(policy);
    const cadence = channel === "live" ? liveDiscoveryInterval(policy, sharedLiveFixtures(tracked, policy, requestedAt).length > 0) ?? dateMs
      : channel === "date" ? dateMs : activeMs;
    const previousFailures = channel === "live" ? lease!.liveFailures : channel === "date" ? lease!.dateFailures : Math.max(0, ...tracked.map((fixture) => fixture.failures));
    // Reserve the cadence before dispatch; a crash never immediately repeats it.
    if (channel === "ids") await store.attempts(lease!, tracked.map((fixture) => ({ fixtureId: fixture.fixtureId,
      nextAt: requestedAt + (policy.coordinated ? pollingInterval(fixture, policy, requestedAt) ?? cadence : cadence),
      failures: fixture.failures, error: fixture.delayReason === missingFromLiveFeed ? missingFromLiveFeed : "request-in-progress" })));
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
    const critical = channel === "ids" || hasDueFinals || policy.coordinated && channel === "live";
    const bounds: ApiFootballBounds = { ...policy.request, priority: critical ? "results-cutoff" : "live-date-sync", deadlineAt };
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
      page.contractVersion === API_FOOTBALL_CONTRACT_VERSION && page.currentPage === 1 && (page.totalPages === 1 ||
        policy.coordinated && channel !== "ids" && page.totalPages === 0 && response.data.length === 0) &&
      page.requestParameters.timezone === "Africa/Kampala" && (channel === "live" ? page.requestParameters.live === "all"
        : channel === "date" ? page.requestParameters.date === date :
          (page.requestParameters.ids ?? page.requestParameters.id ?? "").split("-").every((id) => ids.includes(Number(id)))));
    const error = response.error?.quotaReason ?? response.error?.reason ?? (validPages ? null : "pagination-incomplete");
    // A verified complete poll with no in-scope effects has nothing to recover.
    // Cadence/attempt state and the counted quota dispatch still commit below.
    // Partial/error polls retain their original recovery receipt, even if empty.
    const complete = validPages && response.provenance.length > 0 &&
      response.status === "complete" && response.completeness.complete && response.error === null && error === null &&
      response.completeness.invalidRows === 0 && response.completeness.missingIds.length === 0 && response.completeness.reasons.length === 0;
    const scoped = validPages ? response.data.filter((fixture) => policy.coverage.some((entry) =>
      entry.competitionId === fixture.competition.id && entry.season === fixture.competition.season) &&
      (channel !== "date" || fixture.kickoff !== null && getReportingDate(fixture.kickoff) === date) &&
      response.provenance.some((page) => page.retrievedAt === fixture.source.retrievedAt && page.providerUpdatedAt === fixture.source.providerUpdatedAt)) : [];
    let byExternalId = new Map(tracked.map((fixture) => [fixture.externalId, fixture]));
    if (policy.coordinated && complete && channel !== "ids" && options.onDiscoveredFixtures) {
      const unknownIds = scoped.filter(({ id }) => !byExternalId.has(id)).map(({ id }) => id);
      if (unknownIds.length) {
        await renew();
        await options.onDiscoveredFixtures(response, { channel, unknownIds, ...(signal === undefined ? {} : { signal }) });
        await renew();
        byExternalId = new Map((await store.tracked(policy, clock.now())).map(fixture => [fixture.externalId, fixture]));
      }
    }
    const observations = scoped.flatMap(fixture => {
      const canonical = byExternalId.get(fixture.id);
      return canonical ? [parseLifecycleInput({ fixtureId: canonical.fixtureId, fixture, actualStartedAt: null,
        actor: "fixture-result-sync", evidenceRef: policy.evidenceRef })] : [];
    });
    const foundLive = new Set(response.data.map(fixture => fixture.id));
    const missingLiveFixtures = policy.coordinated && channel === "live" && complete ? tracked.filter(fixture =>
      fixture.status === "live" && fixture.firstFinalAt === null && !foundLive.has(fixture.externalId) &&
      (fixture.delayReason !== missingFromLiveFeed || fixture.nextCheckAt === null || fixture.nextCheckAt <= requestedAt)).map(fixture =>
      ({ fixtureId: fixture.fixtureId, competitionId: fixture.competitionId, season: fixture.season })) : [];
    authorize();
    if (!complete || observations.length > 0 || missingLiveFixtures.length > 0) {
      const batchValue = { accountId, policyHash, channel, date, requestedIds: ids, observations,
        receivedAt: clock.now(), error, requestsDispatched: response.requestsDispatched,
        ...(policy.coordinated ? { coordinated: true as const } : {}),
        ...(missingLiveFixtures.length > 0 ? { missingLiveFixtures } : {}) };
      const batch: ResultSyncBatch = { id: evidenceFingerprint(batchValue), ...batchValue };
      await store.save(lease!, batch); await store.apply(lease!, batch);
    }
    const failures = error ? previousFailures + 1 : 0;
    const delay = error ? Math.max(cadence, failureDelay(policy, failures), response.error?.retryAfterMs ?? 0,
      response.error?.retryAt === undefined ? 0 : response.error.retryAt - clock.now()) :
      channel === "live" && scoped.some(fixture => fixture.status === "live") ? liveMs ?? cadence : cadence;
    if (channel === "ids") {
      const refreshed = new Map(observations.map(observation => [observation.externalFixtureId, observation]));
      await store.attempts(lease!, tracked.map(fixture => {
        const row = refreshed.get(fixture.externalId);
        const current = row && policy.coordinated ? { ...fixture, kickoffAt: row.kickoffAt, status: row.status,
          firstFinalAt: finalStatus(row.status) ? fixture.firstFinalAt ?? row.retrievedAt : null } : fixture;
        const now = clock.now(), interval = pollingInterval(current, policy, now);
        const investigate = policy.coordinated && requiresResultInvestigation(current, now);
        const computedAt = now + (row ? interval ?? delay : policy.coordinated ? Math.max(interval ?? delay, delay) : delay);
        const investigationAt = (current.kickoffAt ?? current.firstTrackedAt) + coordinatedResultDefaults.investigateAfterMs;
        const nextAt = row && policy.coordinated && current.firstFinalAt === null && now < investigationAt ? Math.min(computedAt, investigationAt) : computedAt;
        return { fixtureId: fixture.fixtureId, nextAt, failures: row ? 0 : failures || fixture.failures + 1,
          error: row ? investigate ? unresolvedInvestigation : null : fixture.delayReason === missingFromLiveFeed ? missingFromLiveFeed :
            investigate ? unresolvedInvestigation : error ?? "missing-provider-fixture" };
      }));
    } else await store.schedule(lease!, channel, clock.now() + delay, failures, error);
    if (error) { delayed = true; emit("delayed"); }
    return channel === "date" && complete ? new Map(observations.map((observation) =>
      [observation.externalFixtureId, observation.retrievedAt] as const)) : null;
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
      let observedToday: ReadonlyMap<number, number> | null = null;
      if (lease!.nextDateAt <= clock.now()) {
        observedToday = await poll("date", fixtures, [], signal); fixtures = await store.tracked(policy, clock.now());
      }
      const liveFixtures = sharedLiveFixtures(fixtures, policy, clock.now()), live = liveFixtures.length > 0;
      const liveInterval = liveDiscoveryInterval(policy, live);
      const accelerated = policy.coordinated && live && liveInterval !== null && lease!.liveFailures === 0 && lease!.nextLiveAt > clock.now() + liveInterval;
      if ((live || policy.coordinated) && liveInterval !== null && (lease!.nextLiveAt <= clock.now() || accelerated)) {
        const cadence = resultCadence(policy).liveMs;
        const nextAt = cadence === null || policy.coordinated ? null : nextLiveCheckAfterDate(liveFixtures, observedToday, cadence, clock.now());
        if (nextAt !== null) {
          await renew();
          await store.schedule(lease!, "live", nextAt, 0, null);
        } else {
          await poll("live", fixtures, [], signal); fixtures = await store.tracked(policy, clock.now());
        }
      }
      const due = fixtures.filter((fixture) => {
        const interval = pollingInterval(fixture, policy, clock.now());
        const priorityCheck = policy.coordinated && (fixture.delayReason === missingFromLiveFeed ||
          fixture.delayReason !== unresolvedInvestigation && requiresResultInvestigation(fixture, clock.now()));
        return interval !== null && (fixture.nextCheckAt === null || fixture.nextCheckAt <= clock.now()) &&
          (priorityCheck || clock.now() - Math.max(fixture.retrievedAt, fixture.lastSyncAt ?? 0) >= interval);
      }).sort((a, b) => Number(b.delayReason === missingFromLiveFeed) - Number(a.delayReason === missingFromLiveFeed) || (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0) ||
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
