import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import type { HistoryActor, StoredCycle, StoredRevision } from "./history-contract.ts";
import type { PublicationObservation } from "./publication-contract.ts";

export class CutoffLockingError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "not-due" | "wrong-cycle" | "lost-lease" | "unavailable";
  constructor(reason: CutoffLockingError["reason"]) {
    super("Cutoff operation refused or unavailable. Private diagnostics are withheld.");
    this.name = "CutoffLockingError"; this.reason = reason;
  }
}
export const cutoffFail = (reason: CutoffLockingError["reason"]): never => { throw new CutoffLockingError(reason); };
export type CutoffTarget = Readonly<{ fixtureId: string; cycleId: string }>;
export type CutoffPolicy = Readonly<{ version: 1; evidenceRef: string;
  job: Pick<JobEnvelope, "priority" | "maxAttempts" | "timeoutMs" | "leaseMs" | "backoff">;
}>;
export type VoidLockedCycleInput = CutoffTarget & HistoryActor;
export type CutoffRecoveryInput = CutoffTarget & HistoryActor & Readonly<{ recoveryKey: string }>;
export type CutoffAuthority = Readonly<{
  authorize(action: "schedule" | "close" | "observe-play" | "void" | "recover", target: CutoffTarget): void;
  verifyPolicy(policy: CutoffPolicy): boolean;
  verifyObservation(observation: PublicationObservation): boolean;
  verifyVoid(input: VoidLockedCycleInput): boolean;
  verifyRecovery(input: CutoffRecoveryInput): boolean;
}>;
export type CutoffOperation = Readonly<{
  id: string; fixtureId: string; cycleId: string; kind: "close" | "void";
  fixtureVersion: bigint; at: UtcInstant; effectiveCloseAt: UtcInstant;
  reason: string; evidenceRef: string; actor: string; scheduleHash: string;
  cycle: StoredCycle;
}>;
export type CutoffResult = Readonly<{ operation: CutoffOperation; revision: StoredRevision | null }>;
export type CutoffSchedule = Readonly<{ version: number; kickoffAt: UtcInstant; cutoffAt: UtcInstant;
  observedAt: UtcInstant; actualStartedAt: UtcInstant | null }>;
