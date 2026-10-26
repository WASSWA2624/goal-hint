import "server-only";

import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, settlementStatuses } from "../../domain/market-settlement.ts";
import { liveMatchMetrics, liveMatchSnapshotSchema, type LiveMatchEvents, type LiveMatchSnapshot,
  type LiveMatchStatistics } from "../../domain/live-match.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow,
  type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedEvent, NormalizedStatistics } from "../football/api-football-normalize.ts";
import { provenTrue, synchronous } from "../shared/authority-proof.ts";
import { deepFreeze } from "../shared/deep-freeze.ts";
import { LiveMatchError, liveMatchFail, type LiveMatchAuthority, type LiveMatchLease, type LiveMatchPolicy,
  type LiveMatchStore, type LiveMatchTarget } from "./live-match-contract.ts";

const integer = z.number().int().positive();
const policySchema = z.strictObject({ version: z.literal(1), evidenceRef: z.string().trim().min(1).max(256),
  coverage: z.array(z.strictObject({ competitionId: integer, season: integer.max(9999) })).min(1).max(maximumCompetitionScope),
  intervalMs: integer.min(60_000).max(86_400_000), finalIntervalMs: integer.min(60_000).max(86_400_000),
  finalWindowMs: integer.max(7 * 86_400_000), staleAfterMs: integer.min(60_000).max(86_400_000),
  leaseMs: integer.min(10_000).max(600_000), tickMs: integer.min(1000).max(60_000), maxFixturesPerTick: integer.max(50),
  requestWindowMs: integer.max(60_000), request: z.strictObject({ timeoutMs: integer.max(60_000), maxRequests: z.literal(1),
    maxPages: z.literal(1), maxRows: integer.max(500), maxResponseBytes: integer.max(1_000_000),
    retry: z.strictObject({ maxAttempts: integer.max(8), baseDelayMs: z.number().int().nonnegative().max(2000), maxDelayMs: z.number().int().nonnegative().max(2000) }),
    cacheMaxAgeMs: z.literal(0) }),
}).superRefine((v, ctx) => {
  if (v.requestWindowMs + v.tickMs >= v.leaseMs || v.request.timeoutMs > v.requestWindowMs ||
    v.request.retry.baseDelayMs > v.request.retry.maxDelayMs || new Set(v.coverage.map((c) => `${c.competitionId}:${c.season}`)).size !== v.coverage.length)
    ctx.addIssue({ code: "custom", message: "Incoherent live collection policy." });
});
export function parseLiveMatchPolicy(value: unknown): LiveMatchPolicy {
  const parsed = policySchema.safeParse(value);
  return parsed.success ? deepFreeze(parsed.data) : liveMatchFail("policy-required");
}
const targetSchema = z.strictObject({ occurrenceId: z.string().regex(/^[a-f0-9]{64}$/u), fixtureId: z.uuid(), externalId: integer,
  cycleId: z.uuid().nullable(), kickoffAt: z.number().int().nonnegative().nullable(), homeExternalId: integer, awayExternalId: integer,
  status: z.enum(settlementStatuses), statisticsCoverage: z.boolean().nullable(), eventsCoverage: z.boolean().nullable(),
  previous: liveMatchSnapshotSchema.nullable(), failures: z.number().int().min(0).max(16),
}).refine((v) => v.homeExternalId !== v.awayExternalId && (!v.previous || v.previous.fixtureId === v.fixtureId &&
  v.previous.cycleId === v.cycleId && v.previous.kickoffAt === v.kickoffAt));

type Section = LiveMatchStatistics | LiveMatchEvents;
function unavailable(reason: Section["reason"]): Section {
  return { state: "unavailable", retrievedAt: null, providerUpdatedAt: null, reason, items: [] };
}
function retained<S extends Section>(previous: S | undefined, reason: Section["reason"]): S {
  return previous && previous.state !== "unavailable" ? { ...previous, state: "partial", reason } : unavailable(reason) as S;
}
function usable<T>(response: ApiFootballResult<T> | null, endpoint: "statistics" | "events", target: LiveMatchTarget, now: number) {
  if (!response || response.provenance.length !== 1 || response.data.length > 500) return null;
  const page = response.provenance[0]!;
  if (page.provider !== "api-football" || page.endpoint !== endpoint || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
    page.fromCache || page.currentPage !== 1 || page.totalPages !== 1 || Object.keys(page.requestParameters).length !== 1 || page.requestParameters.fixture !== String(target.externalId) ||
    !Number.isSafeInteger(page.retrievedAt) || page.retrievedAt > now || page.retrievedAt < 0 ||
    page.providerUpdatedAt !== null && page.providerUpdatedAt > page.retrievedAt || response.data.some((row) => {
      const item = row as NormalizedStatistics | NormalizedEvent;
      return item.source?.provider !== "api-football" || item.source.endpoint !== `/fixtures/${endpoint}` || item.source.retrievedAt !== page.retrievedAt || item.source.providerUpdatedAt !== page.providerUpdatedAt;
    })) return null;
  return { retrievedAt: page.retrievedAt, providerUpdatedAt: page.providerUpdatedAt };
}
export function liveStatistics(response: ApiFootballResult<NormalizedStatistics> | null, target: LiveMatchTarget, now: number): LiveMatchStatistics {
  if (target.statisticsCoverage === false) return unavailable("coverage-unavailable") as LiveMatchStatistics;
  const source = usable(response, "statistics", target, now);
  if (!source || !response || response.status !== "complete" || !response.completeness.complete || response.error !== null)
    return retained(target.previous?.statistics, response?.error?.reason === "schema-error" ? "invalid-response" : "provider-error");
  if (response.data.length > 2 || response.data.some((row) => ![target.homeExternalId, target.awayExternalId].includes(row.team.id)) ||
    new Set(response.data.map((row) => row.team.id)).size !== response.data.length) return retained(target.previous?.statistics, "invalid-response");
  const home = response.data.find((row) => row.team.id === target.homeExternalId), away = response.data.find((row) => row.team.id === target.awayExternalId);
  const items: LiveMatchStatistics["items"] = [];
  for (const metric of liveMatchMetrics) {
    const homeStat = home?.statistics.find((row) => row.supported && row.metric === metric);
    const awayStat = away?.statistics.find((row) => row.supported && row.metric === metric);
    if (!homeStat && !awayStat) continue;
    const percent = metric === "possession" || metric === "pass-accuracy";
    const value = (stat: typeof homeStat) => typeof stat?.value === "number" && stat.unit === (percent ? "percent" : "count") ? stat.value : null;
    items.push({ metric, unit: percent ? "percent" : "count", home: value(homeStat), away: value(awayStat) });
  }
  if (items.length === 0) return { ...unavailable(target.statisticsCoverage === true ? "incomplete-response" : "coverage-unknown"), ...source } as LiveMatchStatistics;
  const partial = !home || !away || items.some((row) => row.home === null || row.away === null);
  return { state: partial ? "partial" : "available", ...source, reason: partial ? "incomplete-response" : null, items };
}
export function liveEvents(response: ApiFootballResult<NormalizedEvent> | null, target: LiveMatchTarget, now: number): LiveMatchEvents {
  if (target.eventsCoverage === false) return unavailable("coverage-unavailable") as LiveMatchEvents;
  const source = usable(response, "events", target, now);
  if (!source || !response || response.status !== "complete" || !response.completeness.complete || response.error !== null)
    return retained(target.previous?.events, response?.error?.reason === "schema-error" ? "invalid-response" : "provider-error");
  if (response.data.some((row) => ![target.homeExternalId, target.awayExternalId].includes(row.teamId))) return retained(target.previous?.events, "invalid-response");
  const supported = response.data.filter((row) => row.type !== "unsupported");
  if (response.data.length === 0 && target.eventsCoverage !== true)
    return { ...unavailable("coverage-unknown"), ...source } as LiveMatchEvents;
  const partial = supported.length !== response.data.length || supported.some((row) => row.elapsed === null);
  return { state: partial ? "partial" : "available", ...source, reason: partial ? "incomplete-response" : null,
    items: supported.map((row, index) => ({ sequence: index + 1, elapsed: row.elapsed, extra: row.extra,
      team: row.teamId === target.homeExternalId ? "home" : "away", type: row.type as "goal" | "card" | "substitution" | "var",
      detail: row.detail, player: row.player, assist: row.assist, comments: row.comments })) };
}

/** One fenced central collector. Visitor reads have no adapter or dispatch path. */
export function createLiveMatchService(options: Readonly<{
  accountKey: string; ownerId?: string; policy: unknown; authority: LiveMatchAuthority; store: LiveMatchStore;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "statistics" | "events">;
  clock?: Clock; onState?: (state: "active" | "idle" | "delayed" | "standby") => void;
}>) {
  const policy = parseLiveMatchPolicy(options.policy), { authority, store, adapter } = options;
  if (!/^[a-f0-9]{64}$/u.test(options.accountKey)) return liveMatchFail("invalid-request");
  const ownerId = options.ownerId ?? randomBytes(32).toString("hex");
  if (!/^[a-f0-9]{64}$/u.test(ownerId)) return liveMatchFail("invalid-request");
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  let lease: LiveMatchLease | null = null, busy = false, monotonicUntil = 0;
  function authorize() {
    try { if (synchronous(authority.authorize()) !== undefined || !provenTrue(() => authority.verifyPolicy(policy))) return liveMatchFail("unauthorized"); }
    catch { return liveMatchFail("unauthorized"); }
  }
  function emit(state: Parameters<NonNullable<typeof options.onState>>[0]) { try { options.onState?.(state); } catch {} }
  async function renew() {
    authorize(); if (!lease) return liveMatchFail("lost-lease");
    const start = performance.now(); lease = await store.renew(lease, policy.leaseMs); monotonicUntil = start + policy.leaseMs;
    if (lease.accountKey !== options.accountKey || lease.ownerId !== ownerId || lease.fence <= 0n || !Number.isSafeInteger(lease.until) || lease.until <= clock.now())
      return liveMatchFail("lost-lease");
  }
  async function collect(target: LiveMatchTarget, signal?: AbortSignal) {
    if (target.status !== "live" && target.status !== "abandoned" && !isPlayedFinalStatus(target.status)) return;
    const start = clock.now(), interval = target.status === "live" ? policy.intervalMs : policy.finalIntervalMs;
    await renew(); await store.schedule(lease!, target, start + interval);
    async function call<T extends NormalizedStatistics | NormalizedEvent>(kind: "statistics" | "events"): Promise<ApiFootballResult<T> | null> {
      if (signal?.aborted || (kind === "statistics" ? target.statisticsCoverage : target.eventsCoverage) === false) return null;
      await renew();
      const controller = new AbortController(), requestedAt = clock.now();
      const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(requestedAt + policy.requestWindowMs, lease!.until - policy.tickMs));
      const timer = setTimeout(() => controller.abort(), Math.min(policy.requestWindowMs, Math.max(1, monotonicUntil - performance.now() - policy.tickMs)));
      const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const check = () => { authorize(); if (!lease || requestSignal.aborted || clock.now() >= deadlineAt || performance.now() >= monotonicUntil - policy.tickMs) return liveMatchFail("lost-lease"); };
      const workflow: ApiFootballFallbackWorkflow = { signal: requestSignal, deadlineAt, check, beforeReserve: check, beforeDispatch: check };
      const bounds: ApiFootballBounds = { ...policy.request, priority: "live-details", deadlineAt };
      try {
        check(); const response = await adapter[kind](target.externalId, bounds, workflow); check();
        return provenTrue(() => authority.verifyResponse(response)) ? response as ApiFootballResult<T> : null;
      } catch (error) { if (error instanceof LiveMatchError) throw error; return null; }
      finally { clearTimeout(timer); }
    }
    const statistics = await call<NormalizedStatistics>("statistics"), events = await call<NormalizedEvent>("events");
    if (signal?.aborted) return;
    await renew(); const now = clock.now();
    const snapshot: LiveMatchSnapshot = liveMatchSnapshotSchema.parse({ version: 1, fixtureId: target.fixtureId,
      cycleId: target.cycleId, kickoffAt: target.kickoffAt, status: target.status, collectedAt: now, staleAfterMs: policy.staleAfterMs,
      statistics: liveStatistics(statistics, target, now), events: liveEvents(events, target, now) });
    const failed = snapshot.statistics.state !== "available" || snapshot.events.state !== "available";
    const failures = failed ? Math.min(16, target.failures + 1) : 0;
    const delay = failed ? Math.min(3_600_000, interval * 2 ** Math.min(4, failures - 1)) : interval;
    authorize(); await store.save(lease!, target, snapshot, now + delay, failures);
  }
  async function runOnce(signal?: AbortSignal): Promise<boolean> {
    if (busy || signal?.aborted) return false; busy = true;
    try {
      authorize(); if (!lease) lease = await store.acquire(ownerId, policy.leaseMs);
      if (!lease) { emit("standby"); return false; }
      await renew(); const parsed = z.array(targetSchema).max(policy.maxFixturesPerTick).safeParse(await store.due(policy, clock.now(), policy.maxFixturesPerTick));
      if (!parsed.success || new Set(parsed.data.map((target) => target.occurrenceId)).size !== parsed.data.length) return liveMatchFail("unavailable");
      const targets = parsed.data;
      for (const target of targets) { if (signal?.aborted) break; await collect(target, signal); }
      emit(targets.length ? "active" : "idle"); return true;
    } catch (error) {
      const previous = lease; lease = null;
      if (previous) await store.release(previous).catch(() => {});
      emit("delayed");
      if (error instanceof LiveMatchError && error.reason === "unauthorized") throw error;
      return false;
    } finally { busy = false; }
  }
  async function stop() { const previous = lease; lease = null; if (previous) await store.release(previous); }
  return Object.freeze({ runOnce, stop, async run(signal: AbortSignal) {
    try { while (!signal.aborted) { await runOnce(signal); if (!signal.aborted) await sleep(policy.tickMs, undefined, { signal }).catch(() => {}); } }
    finally { await stop(); }
  } });
}
