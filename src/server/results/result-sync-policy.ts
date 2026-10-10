import "server-only";

import { z } from "zod";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { resultSyncFail, type ResultSyncPolicy, type TrackedResultFixture } from "./result-sync-contract.ts";

const duration = z.number().int().positive().max(2_147_483_647);
const tiers = z.array(z.strictObject({ untilAgeMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  intervalMs: duration.min(60_000) })).min(1).max(20).refine((rows) => rows.every((row, i) => i === 0 ||
    row.untilAgeMs > rows[i - 1]!.untilAgeMs && row.intervalMs > rows[i - 1]!.intervalMs));
const schema = z.strictObject({ version: z.literal(1), evidenceRef: z.string().trim().min(1).max(512),
  coverage: z.array(z.strictObject({ competitionId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    season: z.number().int().min(1).max(9999) })).min(1).max(maximumCompetitionScope),
  approachMs: duration, activeWindowMs: duration, unresolved: tiers, corrections: tiers,
  // Omitted keeps the spec cadence and its original policy hash; budget-limited accounts may poll more slowly.
  cadence: z.strictObject({ liveMs: duration.min(15_000).nullable(), dateMs: duration.min(60_000), activeMs: duration.min(60_000) }).exactOptional(),
  leaseMs: duration, tickMs: duration.max(10_000), maxBatchesPerTick: z.number().int().min(1).max(100),
  failureBaseMs: duration.min(60_000), failureMaxMs: duration, requestWindowMs: duration,
  request: z.strictObject({ timeoutMs: duration, maxRequests: z.number().int().min(1).max(100),
    maxPages: z.number().int().min(1).max(100), maxRows: z.number().int().min(20).max(100_000),
    maxResponseBytes: z.number().int().positive().max(50_000_000),
    retry: z.strictObject({ maxAttempts: z.number().int().min(1).max(10), baseDelayMs: duration.or(z.literal(0)), maxDelayMs: duration.or(z.literal(0)) }),
    cacheMaxAgeMs: z.number().int().min(0).max(15_000) }),
}).refine((p) => p.leaseMs > p.requestWindowMs + 2 * p.tickMs && p.request.timeoutMs <= p.requestWindowMs &&
  p.failureMaxMs >= p.failureBaseMs && p.request.retry.maxDelayMs >= p.request.retry.baseDelayMs &&
  new Set(p.coverage.map((row) => `${row.competitionId}:${row.season}`)).size === p.coverage.length);

export function parseResultSyncPolicy(value: unknown): ResultSyncPolicy {
  const parsed = schema.safeParse(value);
  return parsed.success ? freezeEvidence(parsed.data) : resultSyncFail("policy-required");
}
const specCadence = Object.freeze({ liveMs: 15_000, dateMs: 60_000, activeMs: 60_000 });
export function resultCadence(policy: ResultSyncPolicy): NonNullable<ResultSyncPolicy["cadence"]> { return policy.cadence ?? specCadence; }
export function finalStatus(status: string) {
  return ["finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"].includes(status);
}
/** Horizons stop outbound work; they never remove the stored unresolved result. */
export function pollingInterval(fixture: TrackedResultFixture, policy: ResultSyncPolicy, now: number): number | null {
  if (fixture.firstFinalAt !== null) {
    return policy.corrections.find((tier) => now - fixture.firstFinalAt! < tier.untilAgeMs)?.intervalMs ?? null;
  }
  const age = now - (fixture.kickoffAt ?? fixture.firstTrackedAt);
  if (fixture.kickoffAt !== null && age < -policy.approachMs) return null;
  if (age < policy.activeWindowMs) return resultCadence(policy).activeMs;
  return policy.unresolved.find((tier) => age - policy.activeWindowMs < tier.untilAgeMs)?.intervalMs ?? null;
}
export function shouldPollLive(fixtures: readonly TrackedResultFixture[], policy: ResultSyncPolicy, now: number) {
  if (resultCadence(policy).liveMs === null) return false;
  return fixtures.some((fixture) => fixture.firstFinalAt === null && now - (fixture.kickoffAt ?? fixture.firstTrackedAt) < policy.activeWindowMs &&
    !(fixture.kickoffAt !== null && now - fixture.kickoffAt < -policy.approachMs) &&
    (fixture.status === "live" || fixture.status === "scheduled" && fixture.kickoffAt !== null &&
      now >= fixture.kickoffAt - policy.approachMs));
}
export function failureDelay(policy: ResultSyncPolicy, failures: number) {
  return Math.min(policy.failureMaxMs, policy.failureBaseMs * 2 ** Math.min(Math.max(0, failures - 1), 30));
}
