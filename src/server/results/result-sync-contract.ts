import "server-only";

import type { Clock, UtcInstant } from "../../domain/calendar.ts";
import type { ApiFootballBounds, ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixture } from "../football/api-football-normalize.ts";
import type { LifecycleObservation } from "../predictions/lifecycle-contract.ts";

export class ResultSyncError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "lost-lease" | "unavailable";
  constructor(reason: ResultSyncError["reason"]) {
    super("Result synchronization refused or unavailable; private diagnostics are withheld.");
    this.name = "ResultSyncError"; this.reason = reason;
  }
}
export const resultSyncFail = (reason: ResultSyncError["reason"]): never => { throw new ResultSyncError(reason); };
export type PollingTier = Readonly<{ untilAgeMs: number; intervalMs: number }>;
export type ResultSyncPolicy = Readonly<{
  version: 1; evidenceRef: string;
  coverage: readonly Readonly<{ competitionId: number; season: number }>[];
  approachMs: number; activeWindowMs: number;
  unresolved: readonly PollingTier[]; corrections: readonly PollingTier[];
  /** Omitted uses the spec cadence. Live null disables the shared live feed; date sync still observes today's statuses. */
  cadence?: Readonly<{ liveMs: number | null; dateMs: number; activeMs: number }>;
  leaseMs: number; tickMs: number; maxBatchesPerTick: number;
  failureBaseMs: number; failureMaxMs: number;
  requestWindowMs: number;
  request: Omit<ApiFootballBounds, "priority" | "deadlineAt" | "cacheScope">;
}>;
export type ResultSyncAuthority = Readonly<{
  authorize(): void;
  verifyPolicy(policy: ResultSyncPolicy): boolean;
  verifyResponse(response: ApiFootballResult<NormalizedFixture>): boolean;
}>;
export type PollChannel = "live" | "date" | "ids";
export type PollLease = Readonly<{
  accountId: string; ownerId: string; fence: bigint; until: UtcInstant;
  nextLiveAt: number; nextDateAt: number; liveFailures: number; dateFailures: number;
}>;
export type TrackedResultFixture = Readonly<{
  fixtureId: string; externalId: number; competitionId: number; season: number;
  kickoffAt: number | null; status: string; retrievedAt: number;
  firstTrackedAt: number; firstFinalAt: number | null;
  lastSyncAt: number | null; nextCheckAt: number | null; failures: number;
}>;
export type ResultSyncBatch = Readonly<{
  id: string; accountId: string; policyHash: string; receivedAt: UtcInstant;
  channel: PollChannel; date: string | null; requestedIds: readonly number[];
  observations: readonly LifecycleObservation[];
  error: string | null; requestsDispatched: number;
}>;
export type ResultSyncStore = Readonly<{
  acquire(ownerId: string, leaseMs: number): Promise<PollLease | null>;
  renew(lease: PollLease, leaseMs: number): Promise<PollLease>;
  release(lease: PollLease): Promise<void>;
  tracked(policy: ResultSyncPolicy, now: UtcInstant): Promise<readonly TrackedResultFixture[]>;
  pending(lease: PollLease): Promise<readonly ResultSyncBatch[]>;
  save(lease: PollLease, batch: ResultSyncBatch): Promise<void>;
  apply(lease: PollLease, batch: ResultSyncBatch): Promise<void>;
  schedule(lease: PollLease, channel: "live" | "date", nextAt: number, failures: number, error: string | null): Promise<void>;
  attempts(lease: PollLease, entries: readonly Readonly<{ fixtureId: string; nextAt: number | null; failures: number; error: string | null }>[]): Promise<void>;
}>;
export type ResultSyncClock = Clock;
