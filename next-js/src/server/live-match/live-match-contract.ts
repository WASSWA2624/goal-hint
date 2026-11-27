import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { LiveMatchSnapshot } from "../../domain/live-match.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { ApiFootballBounds, ApiFootballResult } from "../football/api-football-contract.ts";
import type { FixtureDetailFacts } from "../football/fixture-match-details.ts";

type LiveMatchFacts = Readonly<{ values: FixtureDetailFacts; retrievedAt: UtcInstant }>;

export type LiveMatchPolicy = Readonly<{
  version: 1; evidenceRef: string; coverage: readonly Readonly<{ competitionId: number; season: number }>[];
  coordinated?: true;
  stopAfterFinal?: true;
  intervalMs: number; finalIntervalMs: number; finalWindowMs: number; staleAfterMs: number;
  lineupLeadMs?: number; lineupIntervalMs?: number;
  leaseMs: number; tickMs: number; maxFixturesPerTick: number; requestWindowMs: number;
  request: Omit<ApiFootballBounds, "priority" | "deadlineAt" | "cacheScope">;
}>;
export type LiveMatchLease = Readonly<{ accountKey: string; ownerId: string; fence: bigint; until: UtcInstant }>;
export type LiveMatchTarget = Readonly<{
  occurrenceId: string; fixtureId: string; externalId: number; cycleId: string | null; kickoffAt: number | null;
  homeExternalId: number; awayExternalId: number; status: SettlementStatus;
  statisticsCoverage: boolean | null; eventsCoverage: boolean | null;
  coordinated?: true;
  firstFinalAt?: number | null;
  lineupsKnown?: boolean; lineupsCoverage?: boolean | null;
  playersCoverage?: boolean | null; halfStatisticsKnown?: boolean; season?: number;
  previous: LiveMatchSnapshot | null; failures: number;
}>;
export type LiveMatchStore = Readonly<{
  acquire(ownerId: string, leaseMs: number): Promise<LiveMatchLease | null>;
  renew(lease: LiveMatchLease, leaseMs: number): Promise<LiveMatchLease>;
  release(lease: LiveMatchLease): Promise<void>;
  due(policy: LiveMatchPolicy, now: UtcInstant, limit: number): Promise<readonly LiveMatchTarget[]>;
  /** Fence and reserve the next attempt before dispatch, including on the first observation. */
  schedule(lease: LiveMatchLease, target: LiveMatchTarget, nextAt: number): Promise<void>;
  /** Reject a changed occurrence. One bounded body is replaced, never appended per poll. */
  save(lease: LiveMatchLease, target: LiveMatchTarget, snapshot: LiveMatchSnapshot, nextAt: number, failures: number,
    facts?: LiveMatchFacts | readonly LiveMatchFacts[]): Promise<void>;
}>;
export type LiveMatchAuthority = Readonly<{
  authorize(): void;
  verifyPolicy(policy: LiveMatchPolicy): boolean;
  verifyResponse(response: ApiFootballResult<unknown>): boolean;
}>;
export class LiveMatchError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "lost-lease" | "unavailable";
  constructor(reason: LiveMatchError["reason"]) { super("Live match collection unavailable; private diagnostics are withheld.");
    this.name = "LiveMatchError"; this.reason = reason; }
}
export const liveMatchFail = (reason: LiveMatchError["reason"]): never => { throw new LiveMatchError(reason); };

const minute = 60_000;
export const coordinatedLiveDetailDefaults = Object.freeze({ liveMs: minute, lineupLeadMs: 90 * minute,
  lineupMs: 15 * minute, finalFirstMs: 15 * minute, finalLastMs: 24 * 60 * minute, staleAfterMs: 5 * minute });
