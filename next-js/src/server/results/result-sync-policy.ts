import "server-only";

import { z } from "zod";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { resultSyncFail, type ResultSyncBatch, type ResultSyncPolicy, type TrackedResultFixture } from "./result-sync-contract.ts";

const duration = z.number().int().positive().max(2_147_483_647);
const tiers = z.array(z.strictObject({ untilAgeMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  intervalMs: duration.min(60_000) })).min(1).max(20).refine((rows) => rows.every((row, i) => i === 0 ||
    row.untilAgeMs > rows[i - 1]!.untilAgeMs && row.intervalMs > rows[i - 1]!.intervalMs));
const schema = z.strictObject({ version: z.literal(1), evidenceRef: z.string().trim().min(1).max(512),
  coordinated: z.literal(true).exactOptional(),
  coverage: z.array(z.strictObject({ competitionId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    season: z.number().int().min(1).max(9999) })).min(1).max(maximumCompetitionScope),
  archiveCompetitionIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1)
    .max(maximumCompetitionScope).exactOptional(),
  approachMs: duration, activeWindowMs: duration, unresolved: tiers, corrections: tiers,
  skipConfirmedFinals: z.literal(true).exactOptional(),
  // Omitted keeps the spec cadence and its original policy hash; budget-limited accounts may poll more slowly.
  cadence: z.strictObject({ liveMs: duration.min(15_000).nullable(), dateMs: duration.min(60_000), activeMs: duration.min(60_000),
    idleLiveMs: duration.min(60_000).exactOptional() }).exactOptional(),
  leaseMs: duration, tickMs: duration.max(10_000), maxBatchesPerTick: z.number().int().min(1).max(100),
  failureBaseMs: duration.min(60_000), failureMaxMs: duration, requestWindowMs: duration,
  request: z.strictObject({ timeoutMs: duration, maxRequests: z.number().int().min(1).max(100),
    maxPages: z.number().int().min(1).max(100), maxRows: z.number().int().min(20).max(100_000),
    maxResponseBytes: z.number().int().positive().max(50_000_000),
    retry: z.strictObject({ maxAttempts: z.number().int().min(1).max(10), baseDelayMs: duration.or(z.literal(0)), maxDelayMs: duration.or(z.literal(0)) }),
    cacheMaxAgeMs: z.number().int().min(0).max(15_000) }),
}).refine((p) => p.leaseMs > p.requestWindowMs + 2 * p.tickMs && p.request.timeoutMs <= p.requestWindowMs &&
  p.failureMaxMs >= p.failureBaseMs && p.request.retry.maxDelayMs >= p.request.retry.baseDelayMs &&
  (p.archiveCompetitionIds === undefined || p.coordinated === true && new Set(p.archiveCompetitionIds).size === p.archiveCompetitionIds.length) &&
  new Set(p.coverage.map((row) => `${row.competitionId}:${row.season}`)).size === p.coverage.length);

export function parseResultSyncPolicy(value: unknown): ResultSyncPolicy {
  const parsed = schema.safeParse(value);
  return parsed.success ? freezeEvidence(parsed.data) : resultSyncFail("policy-required");
}

/** Compatible stored observations retain their original seal, clocks, and receipt identity. */
export function resultRecoveryMatchesPolicy(batch: ResultSyncBatch, policy: ResultSyncPolicy): boolean {
  const covered = (id: number | null, year: number | null) => policy.coverage.some(({ competitionId, season }) => competitionId === id && season === year);
  const coveredLookup = (observation: ResultSyncBatch["observations"][number]) => batch.channel === "ids" && batch.coordinated === true &&
    batch.requestedIds.includes(observation.externalFixtureId) && policy.archiveCompetitionIds?.includes(observation.competitionExternalId);
  return (batch.coordinated !== true || policy.coordinated === true) &&
    (batch.missingLiveFixtures ?? []).every(({ competitionId, season }) => covered(competitionId, season)) &&
    batch.observations.every((observation) => observation.actor === "fixture-result-sync" && observation.evidenceRef === policy.evidenceRef &&
      (covered(observation.competitionExternalId, observation.season) || coveredLookup(observation)));
}
const specCadence = Object.freeze({ liveMs: 15_000, dateMs: 60_000, activeMs: 60_000 });
const minute = 60_000, hour = 60 * minute, day = 24 * hour;
export const coordinatedResultDefaults = Object.freeze({ liveMs: minute, idleLiveMs: 5 * minute, dateMs: hour, activeMs: minute,
  approachMs: 15 * minute, investigateAfterMs: 48 * hour, unresolvedRecentMs: hour, unresolvedLaterMs: day });
export const missingFromLiveFeed = "missing-from-live-feed";
export const unresolvedInvestigation = "unresolved-investigation";
export const incompleteResultEvidence = "incomplete-result-evidence";
export function resultCadence(policy: ResultSyncPolicy): NonNullable<ResultSyncPolicy["cadence"]> {
  return policy.cadence ?? (policy.coordinated ? coordinatedResultDefaults : specCadence);
}
export function liveDiscoveryInterval(policy: ResultSyncPolicy, active: boolean): number | null {
  const { liveMs, idleLiveMs } = resultCadence(policy);
  return liveMs === null || active || !policy.coordinated ? liveMs : Math.max(liveMs, idleLiveMs ?? coordinatedResultDefaults.idleLiveMs);
}
export function finalStatus(status: string) {
  return ["finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"].includes(status);
}
/** Horizons stop outbound work; they never remove the stored unresolved result. */
export function resultAwaitingVerification(fixture: Pick<TrackedResultFixture, "firstFinalAt" | "finalConfirmed">) {
  return fixture.firstFinalAt === null || fixture.finalConfirmed === false;
}
export function requiresResultInvestigation(fixture: Pick<TrackedResultFixture, "kickoffAt" | "firstTrackedAt" | "firstFinalAt" | "finalConfirmed">, now: number) {
  return resultAwaitingVerification(fixture) && now - (fixture.kickoffAt ?? fixture.firstTrackedAt) >= coordinatedResultDefaults.investigateAfterMs;
}
export function pollingInterval(fixture: TrackedResultFixture, policy: ResultSyncPolicy, now: number): number | null {
  if (fixture.firstFinalAt !== null && (!policy.coordinated || !resultAwaitingVerification(fixture))) {
    if (policy.skipConfirmedFinals && fixture.finalConfirmed) return null;
    return policy.corrections.find((tier) => now - fixture.firstFinalAt! < tier.untilAgeMs)?.intervalMs ?? null;
  }
  const age = now - (fixture.kickoffAt ?? fixture.firstTrackedAt);
  if (policy.coordinated) {
    if (fixture.status === "live" && age < policy.activeWindowMs) return resultCadence(policy).activeMs;
    if (age < 0) return null;
    return requiresResultInvestigation(fixture, now) ? coordinatedResultDefaults.unresolvedLaterMs : coordinatedResultDefaults.unresolvedRecentMs;
  }
  if (fixture.kickoffAt !== null && age < -policy.approachMs) return null;
  if (age < policy.activeWindowMs) return resultCadence(policy).activeMs;
  return policy.unresolved.find((tier) => age - policy.activeWindowMs < tier.untilAgeMs)?.intervalMs ?? null;
}
export function shouldPollLive(fixtures: readonly TrackedResultFixture[], policy: ResultSyncPolicy, now: number) {
  return sharedLiveFixtures(fixtures, policy, now).length > 0;
}

export function sharedLiveFixtures(fixtures: readonly TrackedResultFixture[], policy: ResultSyncPolicy, now: number) {
  if (resultCadence(policy).liveMs === null) return [];
  if (policy.coordinated) return fixtures.filter((fixture) => fixture.firstFinalAt === null &&
    (fixture.status === "live" && now - (fixture.kickoffAt ?? fixture.firstTrackedAt) < policy.activeWindowMs ||
    fixture.status === "scheduled" && fixture.kickoffAt !== null && fixture.kickoffAt >= now && fixture.kickoffAt <= now + policy.approachMs));
  return fixtures.filter((fixture) => fixture.firstFinalAt === null && now - (fixture.kickoffAt ?? fixture.firstTrackedAt) < policy.activeWindowMs &&
    !(fixture.kickoffAt !== null && now - fixture.kickoffAt < -policy.approachMs) &&
    (fixture.status === "live" || fixture.status === "scheduled" && fixture.kickoffAt !== null &&
      now >= fixture.kickoffAt - policy.approachMs));
}

/** A complete date sweep can stand in for this live slot only if it just observed every expected live fixture. */
export function nextLiveCheckAfterDate(fixtures: readonly TrackedResultFixture[], observations: ReadonlyMap<number, number> | null,
  cadenceMs: number, now: number): number | null {
  if (!observations || fixtures.length === 0) return null;
  let nextAt = now + cadenceMs;
  for (const { externalId } of fixtures) {
    const observedAt = observations.get(externalId);
    if (observedAt === undefined || observedAt > now || observedAt + cadenceMs <= now) return null;
    nextAt = Math.min(nextAt, observedAt + cadenceMs);
  }
  return nextAt;
}
export function failureDelay(policy: ResultSyncPolicy, failures: number) {
  return Math.min(policy.failureMaxMs, policy.failureBaseMs * 2 ** Math.min(Math.max(0, failures - 1), 30));
}
