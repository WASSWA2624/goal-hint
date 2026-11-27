import "server-only";

import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { LiveMatchEvents } from "../../domain/live-match.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedEvent, NormalizedFixture } from "../football/api-football-normalize.ts";
import { projectMatchEvents } from "../live-match/live-match-service.ts";
import { parseLifecycleInput } from "../predictions/lifecycle-input.ts";
import { historyHash } from "../predictions/history-input.ts";
import { ResultSyncError, resultSyncFail, type AppliedResultObservation, type PollChannel, type PollLease, type ResultSyncAuthority, type ResultSyncBatch,
  type ResultSyncStore, type TrackedResultFixture } from "./result-sync-contract.ts";
import { activelyPlaying, coordinatedResultDefaults, failureDelay, finalStatus, incompleteResultEvidence, liveDiscoveryInterval, missingFromLiveFeed, nextLiveCheckAfterDate, parseResultSyncPolicy,
  pollingInterval, requiresResultInvestigation, resultAwaitingVerification, resultCadence, sharedLiveFixtures, unresolvedInvestigation } from "./result-sync-policy.ts";

export type ResultPollReport = Readonly<{ channel: PollChannel; requests: number; fixtures: number; applied: number;
  liveEvents: number; status: "completed" | "partial" | "failed" | "deferred"; providerToDatabaseMs: number | null }>;

function hasEmbeddedEvents(fixture: NormalizedFixture): fixture is NormalizedFixture & { matchEvents: readonly NormalizedEvent[] } {
  return "matchEvents" in fixture && Array.isArray(fixture.matchEvents) && fixture.matchEvents.length > 0;
}

export function createResultSyncService(options: Readonly<{
  accountId: string; ownerId?: string; policy: unknown; authority: ResultSyncAuthority; store: ResultSyncStore;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "liveFixtures" | "fixturesByDate" | "unresolvedFixtures">;
  /** Reconcile unknown canonical identities using the already-counted broad response. */
  onDiscoveredFixtures?: (response: ApiFootballResult<NormalizedFixture>, context: Readonly<{
    channel: "live" | "date"; unknownIds: readonly number[]; signal?: AbortSignal;
  }>) => Promise<void>;
  verifyLiveEvents?: (response: ApiFootballResult<NormalizedFixture>) => boolean;
  onPoll?: (report: ResultPollReport) => void;
  clock?: Clock; onState?: (state: "active" | "idle" | "delayed" | "standby") => void;
}>) {
  const policy = parseResultSyncPolicy(options.policy), policyHash = evidenceFingerprint(policy);
  const accountId = historyHash.parse(options.accountId), ownerId = historyHash.parse(options.ownerId ?? randomBytes(32).toString("hex"));
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, { store, adapter, authority } = options;
  const lastStatusAt = (fixture: TrackedResultFixture) => Math.max(fixture.retrievedAt,
    (policy.coordinated ? fixture.lastVerifiedAt : fixture.lastSyncAt) ?? 0);
  const archive = (fixture: TrackedResultFixture, now: number) => policy.coordinated === true &&
    now - (fixture.kickoffAt ?? fixture.firstTrackedAt) >= coordinatedResultDefaults.investigateAfterMs;
  const reasonForConfirmation = (fixture: TrackedResultFixture) =>
    fixture.delayReason === missingFromLiveFeed || fixture.delayReason === incompleteResultEvidence ? fixture.delayReason : null;
  const currentFixtures = () => store.tracked(policy, clock.now(), policy.coordinated ? "current" : undefined);
  let lease: PollLease | null = null, busy = false, monotonicUntil = 0, delayed = false;
  let observedLiveEvents = new Map<string, string>();
  let nextArchiveAt = 0, scheduledLiveAt = 0;
  function authorize() {
    try {
      if (authority.authorize() !== undefined || authority.verifyPolicy(policy) !== true) return resultSyncFail("unauthorized");
    } catch { return resultSyncFail("unauthorized"); }
  }
  const emit = (state: Parameters<NonNullable<typeof options.onState>>[0]) => { try { options.onState?.(state); } catch {} };
  function liveCadence(fixtures: readonly TrackedResultFixture[], now: number) {
    const candidates = sharedLiveFixtures(fixtures, policy, now);
    return liveDiscoveryInterval(policy, candidates.some(({ status, providerStatus }) => activelyPlaying(status, providerStatus)), candidates.length > 0);
  }
  function retryDelay(failures: number) {
    const delay = failureDelay(policy, failures);
    return policy.coordinated && failures > 1 ? Math.min(policy.failureMaxMs, delay + Math.floor(Math.random() * policy.tickMs)) : delay;
  }
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
    const cadence = channel === "live" ? liveCadence(tracked, requestedAt) ?? dateMs
      : channel === "date" ? dateMs : activeMs;
    const previousFailures = channel === "live" ? lease!.liveFailures : channel === "date" ? lease!.dateFailures : Math.max(0, ...tracked.map((fixture) => fixture.failures));
    // Reserve the cadence before dispatch; a crash never immediately repeats it.
    if (channel === "ids") await store.attempts(lease!, tracked.map((fixture) => ({ fixtureId: fixture.fixtureId,
      nextAt: requestedAt + (policy.coordinated ? pollingInterval(fixture, policy, requestedAt) ?? cadence : cadence),
      failures: fixture.failures, error: reasonForConfirmation(fixture) ?? "request-in-progress" })));
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
    const historical = channel === "ids" && tracked.every(fixture => archive(fixture, requestedAt));
    const critical = channel === "ids" || hasDueFinals || policy.coordinated && channel === "live";
    const bounds: ApiFootballBounds = { ...policy.request, priority: historical ? "historical-backfill" : critical ? "results-cutoff" : "live-date-sync", deadlineAt };
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
    const pageError = response.error?.quotaReason ?? response.error?.reason ?? (validPages && response.provenance.length > 0 ? null : "pagination-incomplete");
    // A verified complete poll with no in-scope effects has nothing to recover.
    // Cadence/attempt state and the counted quota dispatch still commit below.
    // Partial/error polls retain their original recovery receipt, even if empty.
    const complete = validPages && response.provenance.length > 0 &&
      response.status === "complete" && response.completeness.complete && pageError === null &&
      response.completeness.invalidRows === 0 && response.completeness.missingIds.length === 0 && response.completeness.reasons.length === 0;
    const error = complete ? null : pageError ?? "incomplete-provider-response";
    let byExternalId = new Map(tracked.map((fixture) => [fixture.externalId, fixture]));
    const scoped = validPages ? response.data.filter((fixture) => (policy.coverage.some((entry) =>
      entry.competitionId === fixture.competition.id && entry.season === fixture.competition.season) ||
      channel === "ids" && ids.includes(fixture.id) && policy.archiveCompetitionIds?.includes(fixture.competition.id) &&
      byExternalId.get(fixture.id)?.season === fixture.competition.season) &&
      (channel !== "date" || fixture.kickoff !== null && getReportingDate(fixture.kickoff) === date) &&
      response.provenance.some((page) => page.retrievedAt === fixture.source.retrievedAt && page.providerUpdatedAt === fixture.source.providerUpdatedAt)) : [];
    if (policy.coordinated && complete && channel !== "ids" && options.onDiscoveredFixtures) {
      const unknownIds = scoped.filter(({ id }) => !byExternalId.has(id)).map(({ id }) => id);
      if (unknownIds.length) {
        await renew();
        await options.onDiscoveredFixtures(response, { channel, unknownIds, ...(signal === undefined ? {} : { signal }) });
        await renew();
        byExternalId = new Map((await currentFixtures()).map(fixture => [fixture.externalId, fixture]));
      }
    }
    const observations = scoped.flatMap(fixture => {
      const canonical = byExternalId.get(fixture.id);
      return canonical ? [parseLifecycleInput({ fixtureId: canonical.fixtureId, fixture, actualStartedAt: null,
        actor: "fixture-result-sync", evidenceRef: policy.evidenceRef })] : [];
    });
    const liveEvents: { fixtureId: string; events: LiveMatchEvents }[] = [];
    const currentEventHashes = new Map<string, string>();
    let captureLiveEvents = false;
    if (policy.coordinated && channel === "live" && complete) {
      try { captureLiveEvents = options.verifyLiveEvents?.(response) === true; } catch { /* Live detail authorization is independent of scores. */ }
    }
    if (captureLiveEvents) for (const fixture of scoped) {
      const canonical = byExternalId.get(fixture.id);
      if (!canonical || fixture.status !== "live" || !hasEmbeddedEvents(fixture)) continue;
      const events = projectMatchEvents(fixture.matchEvents, { homeExternalId: fixture.homeTeam.id, awayExternalId: fixture.awayTeam.id,
        previous: null, eventsCoverage: true }, fixture.source);
      if (events.items.length === 0) continue;
      const hash = evidenceFingerprint({ kickoff: fixture.kickoff, home: fixture.homeTeam.id,
        away: fixture.awayTeam.id, state: events.state, items: events.items });
      currentEventHashes.set(canonical.fixtureId, hash);
      if (observedLiveEvents.get(canonical.fixtureId) !== hash) liveEvents.push({ fixtureId: canonical.fixtureId, events });
    }
    const foundLive = new Set(response.data.map(fixture => fixture.id));
    const missingLiveFixtures = policy.coordinated && channel === "live" && complete ? tracked.filter(fixture =>
      fixture.status === "live" && fixture.firstFinalAt === null && !foundLive.has(fixture.externalId) &&
      requestedAt - (fixture.kickoffAt ?? fixture.firstTrackedAt) < policy.activeWindowMs &&
      (fixture.delayReason !== missingFromLiveFeed || fixture.nextCheckAt === null || fixture.nextCheckAt <= requestedAt)).map(fixture =>
      ({ fixtureId: fixture.fixtureId, competitionId: fixture.competitionId, season: fixture.season })) : [];
    authorize();
    let applied: readonly AppliedResultObservation[] = [];
    if (!complete || observations.length > 0 || missingLiveFixtures.length > 0) {
      const batchValue = { accountId, policyHash, channel, date, requestedIds: ids, observations,
        receivedAt: clock.now(), error, requestsDispatched: response.requestsDispatched,
        ...(policy.coordinated ? { coordinated: true as const } : {}),
        ...(missingLiveFixtures.length > 0 ? { missingLiveFixtures } : {}), ...(liveEvents.length > 0 ? { liveEvents } : {}) };
      const batch: ResultSyncBatch = { id: evidenceFingerprint(batchValue), ...batchValue };
      await store.save(lease!, batch);
      applied = await store.apply(lease!, batch);
    }
    if (captureLiveEvents) {
      const accepted = new Set(applied.filter(row => row.liveEvents).map(({ fixtureId }) => fixtureId));
      observedLiveEvents = new Map([...currentEventHashes].filter(([id, hash]) => observedLiveEvents.get(id) === hash || accepted.has(id)));
    }
    const failures = error ? previousFailures + 1 : 0;
    const delay = error ? Math.max(cadence, retryDelay(failures), response.error?.retryAfterMs ?? 0,
      response.error?.retryAt === undefined ? 0 : response.error.retryAt - clock.now()) :
      channel === "live" && scoped.some(({ status, providerStatus }) => activelyPlaying(status, providerStatus)) ? liveMs ?? cadence : cadence;
    if (channel === "ids") {
      const refreshed = new Map(applied.map(observation => [observation.fixtureId, observation]));
      const returned = new Set(observations.map(observation => observation.fixtureId));
      await store.attempts(lease!, tracked.map(fixture => {
        const row = refreshed.get(fixture.fixtureId);
        const current = row && policy.coordinated ? { ...fixture, ...row } : fixture;
        const now = clock.now(), interval = pollingInterval(current, policy, now);
        const investigate = policy.coordinated && requiresResultInvestigation(current, now);
        const attempts = failures || fixture.failures + 1;
        const computedAt = now + (row ? interval ?? delay : policy.coordinated ? Math.max(interval ?? delay, delay, retryDelay(attempts)) : delay);
        const investigationAt = (current.kickoffAt ?? current.firstTrackedAt) + coordinatedResultDefaults.investigateAfterMs;
        const nextAt = row && policy.coordinated && resultAwaitingVerification(current) && now < investigationAt ? Math.min(computedAt, investigationAt) : computedAt;
        return { fixtureId: fixture.fixtureId, nextAt, failures: row ? 0 : attempts,
          error: row ? policy.coordinated && finalStatus(row.status) && !row.finalConfirmed ? incompleteResultEvidence :
            investigate ? unresolvedInvestigation : null : reasonForConfirmation(fixture) ?? (investigate ? unresolvedInvestigation :
              error ?? (returned.has(fixture.fixtureId) ? "unverified-provider-fixture" : "missing-provider-fixture")) };
      }));
    } else {
      const nextAt = policy.coordinated && channel === "live" && complete ? Math.max(clock.now() + 1, requestedAt + delay) : clock.now() + delay;
      await store.schedule(lease!, channel, nextAt, failures, error);
      if (channel === "live") scheduledLiveAt = nextAt;
    }
    if (error) { delayed = true; emit("delayed"); }
    try { options.onPoll?.({ channel, requests: response.requestsDispatched, fixtures: scoped.length, applied: applied.length,
      liveEvents: applied.filter(row => row.liveEvents === "written").length,
      status: complete ? "completed" : response.error?.quotaReason ? "deferred" : response.status === "failed" ? "failed" : "partial",
      providerToDatabaseMs: applied.length === 0 ? null : Math.max(0, clock.now() - Math.min(...applied.map(row => row.retrievedAt))) }); }
    catch { /* Telemetry cannot invalidate a persisted poll. */ }
    if (channel !== "date" || !complete) return null;
    const verified = new Map(applied.map(({ fixtureId, retrievedAt }) => [fixtureId, retrievedAt]));
    return new Map(observations.flatMap(({ fixtureId, externalFixtureId }) => {
      const retrievedAt = verified.get(fixtureId);
      return retrievedAt === undefined ? [] : [[externalFixtureId, retrievedAt] as const];
    }));
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
      scheduledLiveAt = lease.nextLiveAt;
      if (!await recover(signal)) { emit("delayed"); return true; }
      let fixtures = await currentFixtures();
      let remainingBatches = policy.maxBatchesPerTick;
      // Retain the legacy correction order. Coordinated work always serves current live fixtures first.
      const urgent = fixtures.filter((fixture) => {
        const interval = pollingInterval(fixture, policy, clock.now());
        return !policy.coordinated && fixture.firstFinalAt !== null && interval !== null && (fixture.nextCheckAt === null || fixture.nextCheckAt <= clock.now()) &&
          clock.now() - lastStatusAt(fixture) >= interval &&
          (lease!.nextDateAt > clock.now() || fixture.kickoffAt === null ||
            getReportingDate(utcInstantFromEpochMilliseconds(fixture.kickoffAt)) !== getReportingDate(clock.now()));
      }).sort((a, b) => lastStatusAt(a) - lastStatusAt(b) || a.externalId - b.externalId);
      for (let offset = 0; offset < urgent.length && remainingBatches > 0; offset += 20, remainingBatches--) {
        const group = urgent.slice(offset, offset + 20); await poll("ids", group, group.map((fixture) => fixture.externalId), signal);
      }
      if (urgent.length) fixtures = await currentFixtures();
      let observedToday: ReadonlyMap<number, number> | null = null;
      if (!policy.coordinated && lease!.nextDateAt <= clock.now()) {
        observedToday = await poll("date", fixtures, [], signal); fixtures = await currentFixtures();
      }
      const liveFixtures = sharedLiveFixtures(fixtures, policy, clock.now()), relevant = liveFixtures.length > 0;
      const liveInterval = liveCadence(fixtures, clock.now());
      const accelerated = policy.coordinated && relevant && liveInterval !== null && lease!.liveFailures === 0 && lease!.nextLiveAt > clock.now() + liveInterval;
      if ((relevant || policy.coordinated) && liveInterval !== null && (lease!.nextLiveAt <= clock.now() || accelerated)) {
        const cadence = resultCadence(policy).liveMs;
        const nextAt = cadence === null || policy.coordinated ? null : nextLiveCheckAfterDate(liveFixtures, observedToday, cadence, clock.now());
        if (nextAt !== null) {
          await renew();
          await store.schedule(lease!, "live", nextAt, 0, null);
        } else {
          await poll("live", fixtures, [], signal); fixtures = await currentFixtures();
        }
      }
      if (policy.coordinated && lease!.nextDateAt <= clock.now()) {
        await poll("date", fixtures, [], signal); fixtures = await currentFixtures();
      }
      const due = (fixture: TrackedResultFixture, at: number) => {
        const interval = pollingInterval(fixture, policy, at);
        const priorityCheck = policy.coordinated && (reasonForConfirmation(fixture) !== null ||
          fixture.delayReason !== unresolvedInvestigation && requiresResultInvestigation(fixture, at));
        return interval !== null && (fixture.nextCheckAt === null || fixture.nextCheckAt <= at) &&
          (priorityCheck || at - lastStatusAt(fixture) >= interval);
      };
      const currentAt = clock.now();
      const dueCurrent = fixtures.filter(fixture => !archive(fixture, currentAt) && due(fixture, currentAt))
        .sort((a, b) => Number(b.delayReason === missingFromLiveFeed) - Number(a.delayReason === missingFromLiveFeed) ||
          (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0) || lastStatusAt(a) - lastStatusAt(b) || a.externalId - b.externalId);
      const exhausted = fixtures.filter((fixture) => fixture.nextCheckAt !== null && pollingInterval(fixture, policy, clock.now()) === null &&
        (fixture.firstFinalAt !== null || clock.now() - (fixture.kickoffAt ?? fixture.firstTrackedAt) >= policy.activeWindowMs));
      if (exhausted.length) await store.attempts(lease!, exhausted.map((fixture) => ({ fixtureId: fixture.fixtureId,
        nextAt: null, failures: fixture.failures, error: "polling-horizon-exhausted" })));
      const playing = policy.coordinated && sharedLiveFixtures(fixtures, policy, currentAt)
        .some(({ status, providerStatus }) => activelyPlaying(status, providerStatus));
      const liveSlotDueSoon = () => playing && scheduledLiveAt <= clock.now() + policy.tickMs;
      for (let offset = 0; offset < dueCurrent.length && remainingBatches > 0; offset += 20, remainingBatches--) {
        if (offset > 0 && liveSlotDueSoon()) break;
        const group = dueCurrent.slice(offset, offset + 20);
        await poll("ids", group, group.map((fixture) => fixture.externalId), signal);
      }
      // Bound archive work between live slots. Quota admission reuses the protected shared account.
      const archiveAt = clock.now();
      if (policy.coordinated && remainingBatches > 0 && archiveAt >= nextArchiveAt && !signal?.aborted && !liveSlotDueSoon()) {
        const archived = await store.tracked(policy, archiveAt, "archive");
        const group = archived.filter(fixture => archive(fixture, archiveAt) && due(fixture, archiveAt)).slice(0, 20);
        nextArchiveAt = archiveAt + (group.length === 0 ? coordinatedResultDefaults.idleLiveMs : coordinatedResultDefaults.activeMs);
        if (group.length > 0) await poll("ids", group, group.map(fixture => fixture.externalId), signal);
      }
      emit(delayed ? "delayed" : relevant ? "active" : "idle"); return true;
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
        const untilLive = scheduledLiveAt - clock.now();
        const delay = policy.coordinated && untilLive > 0 ? Math.min(policy.tickMs, untilLive) : policy.tickMs;
        if (!signal.aborted) await sleep(delay, undefined, { signal }).catch(() => {});
      }
    } finally { await stop(); }
  } });
}
