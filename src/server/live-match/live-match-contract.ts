import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { LiveMatchSnapshot } from "../../domain/live-match.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { ApiFootballBounds, ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedStatistics, NormalizedEvent } from "../football/api-football-normalize.ts";

export type LiveMatchPolicy = Readonly<{
  version: 1; evidenceRef: string; coverage: readonly Readonly<{ competitionId: number; season: number }>[];
  intervalMs: number; finalIntervalMs: number; finalWindowMs: number; staleAfterMs: number;
  leaseMs: number; tickMs: number; maxFixturesPerTick: number; requestWindowMs: number;
  request: Omit<ApiFootballBounds, "priority" | "deadlineAt" | "cacheScope">;
}>;
export type LiveMatchLease = Readonly<{ accountKey: string; ownerId: string; fence: bigint; until: UtcInstant }>;
export type LiveMatchTarget = Readonly<{
  occurrenceId: string; fixtureId: string; externalId: number; cycleId: string | null; kickoffAt: number | null;
  homeExternalId: number; awayExternalId: number; status: SettlementStatus;
  statisticsCoverage: boolean | null; eventsCoverage: boolean | null;
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
  save(lease: LiveMatchLease, target: LiveMatchTarget, snapshot: LiveMatchSnapshot, nextAt: number, failures: number): Promise<void>;
}>;
export type LiveMatchAuthority = Readonly<{
  authorize(): void;
  verifyPolicy(policy: LiveMatchPolicy): boolean;
  verifyResponse(response: ApiFootballResult<NormalizedStatistics> | ApiFootballResult<NormalizedEvent>): boolean;
}>;
export class LiveMatchError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "lost-lease" | "unavailable";
  constructor(reason: LiveMatchError["reason"]) { super("Live match collection unavailable; private diagnostics are withheld.");
    this.name = "LiveMatchError"; this.reason = reason; }
}
export const liveMatchFail = (reason: LiveMatchError["reason"]): never => { throw new LiveMatchError(reason); };
