import "server-only";

import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, settlementStatuses } from "../../domain/market-settlement.ts";
import { liveMatchMetrics, liveMatchSnapshotSchema, type LiveMatchEvents, type LiveMatchSnapshot,
  type LiveMatchStatistics } from "../../domain/live-match.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow,
  type ApiFootballResult } from "../football/api-football-contract.ts";
import { normalizeStatistics, type NormalizedEvent, type NormalizedStatistics } from "../football/api-football-normalize.ts";
import type { FixtureDetailFacts, NormalizedFixtureMatchDetails } from "../football/fixture-match-details.ts";
import { provenTrue, synchronous } from "../shared/authority-proof.ts";
import { deepFreeze } from "../shared/deep-freeze.ts";
import { coordinatedLiveDetailDefaults, LiveMatchError, liveMatchFail, type LiveMatchAuthority, type LiveMatchLease, type LiveMatchPolicy,
  type LiveMatchStore, type LiveMatchTarget } from "./live-match-contract.ts";

const integer = z.number().int().positive();
const firstHalfStatisticsSeason = 2024;
const afterFirstHalf = new Set(["HT", "2H", "ET", "BT", "P", "FT", "AET", "PEN"]);
const policySchema = z.strictObject({ version: z.literal(1), evidenceRef: z.string().trim().min(1).max(256),
  coordinated: z.literal(true).exactOptional(),
  coverage: z.array(z.strictObject({ competitionId: integer, season: integer.max(9999) })).min(1).max(maximumCompetitionScope),
  stopAfterFinal: z.literal(true).exactOptional(),
  intervalMs: integer.min(60_000).max(86_400_000), finalIntervalMs: integer.min(60_000).max(86_400_000),
  finalWindowMs: integer.max(7 * 86_400_000), staleAfterMs: integer.min(60_000).max(86_400_000),
  leaseMs: integer.min(10_000).max(600_000), tickMs: integer.min(1000).max(60_000), maxFixturesPerTick: integer.max(50),
  requestWindowMs: integer.max(60_000), request: z.strictObject({ timeoutMs: integer.max(60_000), maxRequests: z.literal(1),
    maxPages: z.literal(1), maxRows: integer.max(500), maxResponseBytes: integer.max(8_000_000),
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
  firstFinalAt: z.number().int().nonnegative().nullable().exactOptional(), lineupsKnown: z.boolean().exactOptional(),
  lineupsCoverage: z.boolean().nullable().exactOptional(), playersCoverage: z.boolean().nullable().exactOptional(),
  halfStatisticsKnown: z.boolean().exactOptional(), season: integer.max(9999).exactOptional(),
  previous: liveMatchSnapshotSchema.nullable(), failures: z.number().int().min(0).max(16),
}).refine((v) => v.homeExternalId !== v.awayExternalId && (!v.previous || v.previous.fixtureId === v.fixtureId &&
  v.previous.cycleId === v.cycleId && v.previous.kickoffAt === v.kickoffAt));

export function coordinatedLiveDetailNextAt(target: LiveMatchTarget, policy: LiveMatchPolicy, at: number, received: boolean): number {
  if (target.status === "live") return at + Math.max(policy.intervalMs, coordinatedLiveDetailDefaults.liveMs);
  if (target.status === "scheduled") return at + coordinatedLiveDetailDefaults.lineupMs;
  const firstFinalAt = target.firstFinalAt ?? at;
  const late = firstFinalAt + coordinatedLiveDetailDefaults.finalLastMs;
  // Reserve a short durable retry first, so a crash during the initial reconciliation does not skip it.
  if (!received) return Math.min(at + coordinatedLiveDetailDefaults.finalFirstMs, late > at ? late : Infinity);
  return at < late ? late : Math.max(at + policy.finalIntervalMs, firstFinalAt + policy.finalWindowMs + policy.finalIntervalMs);
}

function allLineups(rows: readonly unknown[] | null | undefined): boolean {
  return rows?.length === 2 && rows.every(row => typeof row === "object" && row !== null && "startXI" in row &&
    Array.isArray(row.startXI) && row.startXI.length >= 11);
}

function hasHalves(rows: readonly unknown[] | null | undefined): boolean {
  return rows?.length === 2 && rows.every(row => typeof row === "object" && row !== null && "statistics_1h" in row &&
    "statistics_2h" in row && Array.isArray(row.statistics_1h) && Array.isArray(row.statistics_2h));
}

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
  return projectMatchStatistics(response.data, target, source);
}

type MatchSides = Pick<LiveMatchTarget, "homeExternalId" | "awayExternalId" | "previous">;
type MatchSourceTime = Pick<LiveMatchStatistics, "retrievedAt" | "providerUpdatedAt">;

/** Project correlated fixture statistics from either the detail poller or a stored fixture batch. */
export function projectMatchStatistics(data: readonly NormalizedStatistics[], target: MatchSides & Pick<LiveMatchTarget, "statisticsCoverage">,
  source: MatchSourceTime): LiveMatchStatistics {
  if (data.length > 2 || data.some((row) => ![target.homeExternalId, target.awayExternalId].includes(row.team.id)) ||
    new Set(data.map((row) => row.team.id)).size !== data.length) return retained(target.previous?.statistics, "invalid-response");
  const home = data.find((row) => row.team.id === target.homeExternalId), away = data.find((row) => row.team.id === target.awayExternalId);
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
  return projectMatchEvents(response.data, target, source);
}

/** Project correlated fixture events without asserting which endpoint returned them. */
export function projectMatchEvents(data: readonly NormalizedEvent[], target: MatchSides & Pick<LiveMatchTarget, "eventsCoverage">,
  source: MatchSourceTime): LiveMatchEvents {
  if (data.some((row) => ![target.homeExternalId, target.awayExternalId].includes(row.teamId))) return retained(target.previous?.events, "invalid-response");
  const supported = data.filter((row) => row.type !== "unsupported");
  if (data.length === 0 && target.eventsCoverage !== true)
    return { ...unavailable("coverage-unknown"), ...source } as LiveMatchEvents;
  const partial = supported.length !== data.length || supported.some((row) => row.elapsed === null);
  return { state: partial ? "partial" : "available", ...source, reason: partial ? "incomplete-response" : null,
    items: supported.map((row, index) => ({ sequence: index + 1, elapsed: row.elapsed, extra: row.extra,
      team: row.teamId === target.homeExternalId ? "home" : "away", type: row.type as "goal" | "card" | "substitution" | "var",
      detail: row.detail, player: row.player, assist: row.assist, comments: row.comments })) };
}

/** One fenced central collector. Visitor reads have no adapter or dispatch path. */
export function createLiveMatchService(options: Readonly<{
  accountKey: string; ownerId?: string; policy: unknown; authority: LiveMatchAuthority; store: LiveMatchStore;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "statistics" | "events">;
  batchDetails?: ReturnType<typeof createApiFootballAdapter>["evidence"]["matchDetails"];
  batchSize?: number;
  supplements?: Readonly<{
    lineups: ReturnType<typeof createApiFootballAdapter>["evidence"]["availability"];
    players: ReturnType<typeof createApiFootballAdapter>["evidence"]["fixturePlayers"];
    halfStatistics: ReturnType<typeof createApiFootballAdapter>["reference"]["page"];
  }>;
  clock?: Clock; onState?: (state: "active" | "idle" | "delayed" | "standby") => void;
}>) {
  const policy = parseLiveMatchPolicy(options.policy), { authority, store, adapter } = options;
  if (!/^[a-f0-9]{64}$/u.test(options.accountKey)) return liveMatchFail("invalid-request");
  const ownerId = options.ownerId ?? randomBytes(32).toString("hex");
  if (!/^[a-f0-9]{64}$/u.test(ownerId)) return liveMatchFail("invalid-request");
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const batchSize = options.batchSize ?? 20;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20) return liveMatchFail("invalid-request");
  let liveSweep = new Map<number, NormalizedFixtureMatchDetails>();
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
  async function request<T>(read: (bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) => Promise<ApiFootballResult<T>>,
    signal?: AbortSignal): Promise<ApiFootballResult<T> | null> {
    if (signal?.aborted) return null;
    await renew();
    const controller = new AbortController(), requestedAt = clock.now();
    const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(requestedAt + policy.requestWindowMs, lease!.until - policy.tickMs));
    const timer = setTimeout(() => controller.abort(), Math.min(policy.requestWindowMs, Math.max(1, monotonicUntil - performance.now() - policy.tickMs)));
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const check = () => { authorize(); if (!lease || requestSignal.aborted || clock.now() >= deadlineAt || performance.now() >= monotonicUntil - policy.tickMs) return liveMatchFail("lost-lease"); };
    const workflow: ApiFootballFallbackWorkflow = { signal: requestSignal, deadlineAt, check, beforeReserve: check, beforeDispatch: check };
    const bounds: ApiFootballBounds = { ...policy.request, priority: "live-details", deadlineAt };
    try { check(); const response = await read(bounds, workflow); check(); return response; }
    catch (error) { if (error instanceof LiveMatchError) throw error; return null; }
    finally { clearTimeout(timer); }
  }
  async function collect(target: LiveMatchTarget, signal?: AbortSignal) {
    if (target.status !== "live" && target.status !== "abandoned" && !isPlayedFinalStatus(target.status)) return;
    const start = clock.now(), interval = target.status === "live" ? policy.intervalMs : policy.finalIntervalMs;
    await renew(); await store.schedule(lease!, target, start + interval);
    async function call<T extends NormalizedStatistics | NormalizedEvent>(coverage: boolean | null,
      read: (bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) => Promise<ApiFootballResult<T>>): Promise<ApiFootballResult<T> | null> {
      if (signal?.aborted || coverage === false) return null;
      const response = await request(read, signal);
      return response && provenTrue(() => authority.verifyResponse(response)) ? response : null;
    }
    const statistics = await call(target.statisticsCoverage, (bounds, workflow) => adapter.statistics(target.externalId, bounds, workflow));
    const events = await call(target.eventsCoverage, (bounds, workflow) => adapter.events(target.externalId, bounds, workflow));
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

  function correlate(target: LiveMatchTarget, detail: NormalizedFixtureMatchDetails | undefined) {
    return detail && detail.kickoff === target.kickoffAt && detail.homeTeam.id === target.homeExternalId
      && detail.awayTeam.id === target.awayExternalId ? detail : null;
  }

  function observeLiveFixtureDetails(response: ApiFootballResult<NormalizedFixtureMatchDetails>) {
    if (!policy.coordinated || !provenTrue(() => authority.verifyResponse(response)) || response.status !== "complete" ||
        !response.completeness.complete || response.provenance.length !== 1) return;
    const page = response.provenance[0]!;
    if (page.provider !== "api-football" || page.endpoint !== "fixtures" || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
        page.fromCache || page.currentPage !== 1 || page.totalPages !== 1 || page.requestParameters.live !== "all" ||
        page.requestParameters.timezone !== "Africa/Kampala" || page.retrievedAt > clock.now()) return;
    liveSweep = new Map(response.data.filter(row => row.status === "live" && row.source.retrievedAt === page.retrievedAt &&
      row.source.providerUpdatedAt === page.providerUpdatedAt && policy.coverage.some(scope =>
        scope.competitionId === row.competition.id && scope.season === row.competition.season)).map(row => [row.id, row]));
  }

  function recentSweepDetail(target: LiveMatchTarget) {
    if (target.status !== "live") return null;
    const detail = correlate(target, liveSweep.get(target.externalId));
    const now = clock.now(), at = detail?.source.retrievedAt;
    const previousAt = Math.max(target.previous?.events.retrievedAt ?? 0, target.previous?.statistics.retrievedAt ?? 0);
    return at === undefined || at > now || at < previousAt || now - at >= Math.max(policy.intervalMs, coordinatedLiveDetailDefaults.liveMs) ? null : detail;
  }

  function reusableDetail(target: LiveMatchTarget) {
    const detail = recentSweepDetail(target);
    if (!detail || (target.eventsCoverage !== false && detail.matchEvents === null) ||
        (target.statisticsCoverage !== false && detail.matchStatistics?.length !== 2) ||
        (target.playersCoverage === true && detail.facts.players?.length !== 2) ||
        (!target.lineupsKnown && target.lineupsCoverage === true && !allLineups(detail.facts.lineups))) return null;
    return detail;
  }

  async function supplement<T>(endpoint: ApiFootballResult<T>["provenance"][number]["endpoint"], fixture: number,
    read: (bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) => Promise<ApiFootballResult<T>>, signal?: AbortSignal) {
    const response = await request(read, signal), page = response?.provenance[0];
    return response?.status === "complete" && response.completeness.complete && response.error === null && response.provenance.length === 1 &&
      page?.provider === "api-football" && page.endpoint === endpoint && page.contractVersion === API_FOOTBALL_CONTRACT_VERSION &&
      page.requestParameters.fixture === String(fixture) && !page.fromCache && page.currentPage === 1 && page.totalPages === 1 &&
      page.retrievedAt <= clock.now() && provenTrue(() => authority.verifyResponse(response)) ? { response, page } : null;
  }

  async function completeSections(target: LiveMatchTarget, detail: NormalizedFixtureMatchDetails | null, broad: NormalizedFixtureMatchDetails | null,
    signal?: AbortSignal) {
    const facts = [] as { values: FixtureDetailFacts; retrievedAt: UtcInstant }[];
    if (broad && broad !== detail && broad.matchEvents !== null && detail?.matchEvents == null) {
      facts.push({ values: { events: broad.facts.events, statistics: null, lineups: null, players: null }, retrievedAt: broad.source.retrievedAt });
    }
    if (detail) facts.push({ values: detail.facts, retrievedAt: detail.source.retrievedAt });
    const { supplements } = options;
    const hasPlayedHalf = isPlayedFinalStatus(target.status) || (detail?.elapsedMinutes ?? 0) >= 45 || afterFirstHalf.has(detail?.providerStatus ?? "");
    let statisticsFromHalves: LiveMatchStatistics | null = null;
    if (supplements && target.status !== "scheduled" && hasPlayedHalf && target.statisticsCoverage === true &&
        (target.season ?? 0) >= firstHalfStatisticsSeason &&
        !target.halfStatisticsKnown && !hasHalves(detail?.facts.statistics)) {
      const halves = await supplement("fixtureHalfStatistics", target.externalId, (bounds, workflow) => supplements.halfStatistics({
        endpoint: "fixtureHalfStatistics", fixtureId: target.externalId, homeTeamId: target.homeExternalId, awayTeamId: target.awayExternalId,
      }, bounds, workflow), signal);
      if (halves?.page.requestParameters.half === "true") {
        const { retrievedAt, providerUpdatedAt } = halves.page;
        const raw = halves.response.data.map(row => row.raw);
        facts.push({ retrievedAt, values: { events: null, statistics: raw, lineups: null, players: null } });
        if (detail?.matchStatistics?.length !== 2) {
          const fullMatch = raw.map(row => normalizeStatistics(row, { retrievedAt, endpoint: "/fixtures/statistics" }));
          if (fullMatch.length === 2 && fullMatch.every(row => row.valid)) {
            statisticsFromHalves = projectMatchStatistics(fullMatch.map(row => row.data), target, { retrievedAt, providerUpdatedAt });
          }
        }
      }
    }
    let statistics: ApiFootballResult<NormalizedStatistics> | null = null, events: ApiFootballResult<NormalizedEvent> | null = null;
    if (!statisticsFromHalves && target.status !== "scheduled" && target.statisticsCoverage === true && detail?.matchStatistics?.length !== 2) {
      statistics = (await supplement("statistics", target.externalId,
        (bounds, workflow) => adapter.statistics(target.externalId, bounds, workflow), signal))?.response ?? null;
    }
    if (target.status !== "scheduled" && target.eventsCoverage === true && detail?.matchEvents == null && broad?.matchEvents == null) {
      events = (await supplement("events", target.externalId,
        (bounds, workflow) => adapter.events(target.externalId, bounds, workflow), signal))?.response ?? null;
    }
    if (supplements && target.lineupsCoverage === true && !target.lineupsKnown && !allLineups(detail?.facts.lineups)) {
      const lineups = await supplement("lineups", target.externalId,
        (bounds, workflow) => supplements.lineups(target.externalId, "lineups", bounds, workflow), signal);
      if (lineups) facts.push({ retrievedAt: lineups.page.retrievedAt, values: { events: null, statistics: null, players: null,
        lineups: lineups.response.data.filter(row => [target.homeExternalId, target.awayExternalId].includes(row.team.id)).map(row => ({
          team: { id: row.team.id, name: row.team.name }, formation: row.formation,
          startXI: row.startingPlayers.map(({ position, ...player }) => ({ player: { ...player, pos: position } })),
          substitutes: row.substitutes.map(({ position, ...player }) => ({ player: { ...player, pos: position } })),
        })) } });
    }
    if (supplements && target.status !== "scheduled" && target.playersCoverage === true && detail?.facts.players?.length !== 2) {
      const players = await supplement("fixturePlayerStatistics", target.externalId, (bounds, workflow) => supplements.players({
        fixtureId: target.externalId, homeTeamId: target.homeExternalId, awayTeamId: target.awayExternalId,
      }, bounds, workflow), signal);
      if (players) facts.push({ retrievedAt: players.page.retrievedAt,
        values: { events: null, statistics: null, lineups: null, players: players.response.data.map(row => row.raw) } });
    }
    return { facts, statistics, statisticsFromHalves, events };
  }

  async function collectBatch(targets: readonly LiveMatchTarget[], read: NonNullable<typeof options.batchDetails>, signal?: AbortSignal) {
    await renew();
    const ready = [];
    for (const target of targets) {
      if (signal?.aborted) return;
      try {
        const now = clock.now();
        await store.schedule(lease!, target, policy.coordinated ? coordinatedLiveDetailNextAt(target, policy, now, false) :
          now + (target.status === "live" ? policy.intervalMs : policy.finalIntervalMs));
        ready.push(target);
      } catch (error) {
        // A result can move this fixture to a new occurrence while the batch is prepared.
        if (!(error instanceof LiveMatchError) || error.reason !== "invalid-request") throw error;
      }
    }
    if (ready.length === 0) return;
    const details = new Map<number, NormalizedFixtureMatchDetails>();
    if (policy.coordinated) for (const target of ready) {
      const reused = reusableDetail(target);
      if (reused) details.set(target.externalId, reused);
    }
    const ids = [...new Set(ready.map(target => target.externalId).filter(id => !details.has(id)))].sort((a, b) => a - b);
    const response = ids.length ? await request((bounds, workflow) => read(ids, bounds, workflow), signal) : null;
    if (signal?.aborted) return;
    const page = response?.provenance[0];
    const accepted = response && page && page.endpoint === "fixtures" && !page.fromCache
      && page.currentPage === 1 && page.totalPages === 1 && (page.requestParameters.ids === ids.join("-") ||
        policy.coordinated && ids.length === 1 && page.requestParameters.id === String(ids[0]))
      && provenTrue(() => authority.verifyResponse(response));
    if (accepted) for (const row of response.data) if (ids.includes(row.id) && row.source.retrievedAt === page.retrievedAt) details.set(row.id, row);
    await renew();
    for (const target of ready) {
      if (signal?.aborted) return;
      const detail = correlate(target, details.get(target.externalId));
      const broad = policy.coordinated ? recentSweepDetail(target) : null;
      const extras = policy.coordinated && detail ? await completeSections(target, detail, broad, signal) : null;
      const now = clock.now();
      const source = detail ? { retrievedAt: detail.source.retrievedAt, providerUpdatedAt: detail.source.providerUpdatedAt } : null;
      const statistics = extras?.statisticsFromHalves ?? (extras?.statistics ? liveStatistics(extras.statistics, target, now) : detail?.matchStatistics && source
        ? projectMatchStatistics(detail.matchStatistics, target, source)
        : retained(target.previous?.statistics, "provider-error"));
      const events = extras?.events ? liveEvents(extras.events, target, now) : detail?.matchEvents && source
        ? projectMatchEvents(detail.matchEvents, target, source)
        : broad?.matchEvents ? projectMatchEvents(broad.matchEvents, target, {
          retrievedAt: broad.source.retrievedAt, providerUpdatedAt: broad.source.providerUpdatedAt,
        }) : retained(target.previous?.events, "provider-error");
      const snapshot = liveMatchSnapshotSchema.parse({ version: 1, fixtureId: target.fixtureId, cycleId: target.cycleId,
        kickoffAt: target.kickoffAt, status: target.status, collectedAt: now, staleAfterMs: policy.staleAfterMs,
        statistics: statistics.state === "unavailable" && target.previous?.statistics.items.length
          ? retained(target.previous.statistics, "incomplete-response") : statistics,
        events: events.state === "unavailable" && target.previous?.events.items.length
          ? retained(target.previous.events, "incomplete-response") : events });
      const observed = detail !== null && source !== null && source.retrievedAt <= now && (policy.coordinated ||
        detail.matchStatistics !== null || detail.matchEvents !== null);
      const failures = observed ? 0 : Math.min(16, target.failures + 1);
      const interval = target.status === "live" ? policy.intervalMs
        : observed || failures >= 3 ? policy.finalWindowMs + policy.finalIntervalMs : policy.finalIntervalMs;
      try {
        authorize();
        const kickoffWithLineups = target.status === "scheduled" && extras?.facts.some(fact => allLineups(fact.values.lineups)) ? target.kickoffAt : null;
        const nextAt = kickoffWithLineups !== null ? Math.max(now + 1, kickoffWithLineups) :
          policy.coordinated ? coordinatedLiveDetailNextAt(target, policy, now, observed) : now + interval;
        await store.save(lease!, target, snapshot, nextAt, failures, extras?.facts ??
          (detail ? { values: detail.facts, retrievedAt: detail.source.retrievedAt } : broad && broad.matchEvents !== null
            ? { values: { events: broad.facts.events, statistics: null, lineups: null, players: null }, retrievedAt: broad.source.retrievedAt } : undefined));
      } catch (error) {
        if (!(error instanceof LiveMatchError) || error.reason !== "invalid-request") throw error;
      }
    }
  }
  async function runOnce(signal?: AbortSignal): Promise<boolean> {
    if (busy || signal?.aborted) return false; busy = true;
    try {
      authorize(); if (!lease) lease = await store.acquire(ownerId, policy.leaseMs);
      if (!lease) { emit("standby"); return false; }
      await renew(); const parsed = z.array(targetSchema).max(policy.maxFixturesPerTick).safeParse(await store.due(policy, clock.now(), policy.maxFixturesPerTick));
      if (!parsed.success || new Set(parsed.data.map((target) => target.occurrenceId)).size !== parsed.data.length) return liveMatchFail("unavailable");
      const targets = parsed.data;
      if (options.batchDetails) {
        for (let offset = 0; offset < targets.length; offset += batchSize) {
          if (signal?.aborted) break;
          await collectBatch(targets.slice(offset, offset + batchSize), options.batchDetails, signal);
        }
      } else {
        for (const target of targets) { if (signal?.aborted) break; await collect(target, signal); }
      }
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
  return Object.freeze({ runOnce, stop, observeLiveFixtureDetails, async run(signal: AbortSignal) {
    try { while (!signal.aborted) { await runOnce(signal); if (!signal.aborted) await sleep(policy.tickMs, undefined, { signal }).catch(() => {}); } }
    finally { await stop(); }
  } });
}
