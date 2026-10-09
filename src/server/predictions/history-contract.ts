import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";

export class PredictionHistoryError extends Error {
  readonly reason: "invalid-request" | "not-found" | "conflicting-request" | "stale-version" | "out-of-order" | "closed-cycle" | "invalid-state" | "unavailable";
  constructor(reason: PredictionHistoryError["reason"]) {
    super("Prediction history is invalid or unavailable. Private diagnostics are withheld.");
    this.name = "PredictionHistoryError"; this.reason = reason;
  }
}
export const historyFail = (reason: PredictionHistoryError["reason"]): never => { throw new PredictionHistoryError(reason); };
export type PredictionCycleState = "open" | "closed" | "void";
export type CycleReferences = Readonly<{
  state: PredictionCycleState; currentSetId: string | null; lockedSetId: string | null;
  closedAt: UtcInstant | null; lockedAt: UtcInstant | null; voidedAt: UtcInstant | null; voidReason: string | null;
}>;
export type StoredCycle = CycleReferences & Readonly<{
  id: string; fixtureId: string; creationKey: string; creationHash: string;
  ordinal: number; version: number; scheduleVersion: number;
  kickoffAt: UtcInstant; cutoffAt: UtcInstant; openedAt: UtcInstant;
}>;
export type HistoryActor = Readonly<{ actor: string; reason: string; evidenceRef: string }>;
export type CreateCycleInput = HistoryActor & Readonly<{
  fixtureId: string; creationKey: string; kickoffAt: UtcInstant; openedAt: UtcInstant; activate: boolean;
}>;
export type ChangeCycleInput = HistoryActor & Readonly<{
  cycleId: string; expectedVersion: number; eventKey: string; at: UtcInstant; next: CycleReferences;
  activate?: boolean;
  schedule?: Readonly<{ kickoffAt: UtcInstant; providerObservedAt: UtcInstant | null; actualStartedAt: UtcInstant | null }>;
}>;
export type AppendRevisionInput = HistoryActor & Readonly<{
  candidate: ResolvedForecastCandidate; evidenceSnapshotId: string; scheduleVersion: number;
  generationCompletedAt: UtcInstant; publishedAt: UtcInstant;
}>;
export type StoredRevision = Readonly<{
  id: string; fixtureId: string; fixtureVersion: bigint; cycleId: string; runId: string; runSequence: bigint;
  jobId: string; fixtureRevision: number; cycleRevision: number; predecessorId: string | null;
  scheduleVersion: number; modelVersionId: string | null; evidenceSnapshotId: string; evidenceHash: string;
  evidenceCutoffAt: UtcInstant; generationCompletedAt: UtcInstant; publishedAt: UtcInstant;
  recordedAt: UtcInstant; ruleVersion: string; requestHash: string; candidate: ResolvedForecastCandidate;
}>;
export type StoredRun = Readonly<{ id: string; sequence: bigint; eatDate: string; createdAt: UtcInstant }>;
export type CycleDisplay = Readonly<{ cycle: StoredCycle; mode: "current" | "locked" | "void"; revision: StoredRevision | null }>;
export type HistoryAuditSnapshot = Readonly<{ cycle: StoredCycle | null; activeCycleId: string | null; revisionId: string | null }>;
export type StoredHistoryAudit = HistoryActor & Readonly<{
  id: string; fixtureId: string; cycleId: string; version: number; eventKey: string; requestHash: string;
  kind: "cycle-created" | "cycle-changed" | "revision-recorded"; recordedAt: UtcInstant;
  before: HistoryAuditSnapshot; after: HistoryAuditSnapshot;
}>;
