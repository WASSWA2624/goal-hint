import "server-only";

import type { ReportingDate } from "../../domain/calendar.ts";
import type { ApiFootballBounds } from "../football/api-football-contract.ts";
import type { CatalogImportRequest } from "../football/catalog-contract.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";

export class DailySelectionError extends Error {
  readonly reason: "invalid-request" | "unauthorized" | "policy-required" | "conflicting-request" |
    "lost-lease" | "incomplete-import" | "capacity-exceeded" | "unavailable";
  constructor(reason: DailySelectionError["reason"]) {
    super("Daily selection refused or unavailable; private diagnostics are withheld.");
    this.name = "DailySelectionError"; this.reason = reason;
  }
}
export const selectionFail = (reason: DailySelectionError["reason"]): never => { throw new DailySelectionError(reason); };
export type DegradedSelectionAction = Readonly<{ actor: string; evidenceRef: string; policyRef: string }>;
export type SelectionPolicy = Readonly<{
  version: 1; evidenceRef: string; competitionIds: readonly number[]; eligibleStatuses: readonly ["scheduled"];
  degradationPolicyRef: string | null; retentionEvidenceRef: string; leaseMs: number;
  attemptsPerInvocation: number; maxFixtures: number;
  /** Nearest-kickoff refresh budget; later eligible fixtures are recorded as deferred exclusions. */
  refreshCapacity?: number;
  /** Dates the provider plan can serve, from the run date; omitted imports all seven. */
  importDays?: number;
  importBounds: Omit<ApiFootballBounds, "deadlineAt"> & Readonly<{ deadlineMs: number }>;
  refresh: Omit<JobEnvelope, "version" | "idempotencyKey" | "refresh" | "notBefore" | "expiresAt" | "priority">;
}>;
export type SelectionAuthority = Readonly<{
  authorize(policy: SelectionPolicy): void;
  verifyPolicy(policy: SelectionPolicy): boolean;
  verifyDegradedAction(action: DegradedSelectionAction, runDate: ReportingDate): boolean;
  verifyCycleEligibility(input: CycleSelectionEligibility): boolean;
}>;
export type CycleSelectionEligibility = Readonly<{
  id: string; fixtureId: string; previousCycleId: string; previousVersion: number;
  kickoffAt: number; state: "postponed" | "void"; actor: string; evidenceRef: string;
}>;
export type SelectionLease = Readonly<{ runId: string; ownerId: string; fence: number }>;
export type SelectionImport = Readonly<{ id: string; request: CatalogImportRequest; finished: boolean }>;
export type SelectionCoverage = Readonly<{
  date: string; status: string; importId: string | null; fixtureIds: readonly string[];
  reasons: readonly string[]; missingCoverage: readonly string[]; provenance: unknown;
}>;
export type SelectionEntry = Readonly<{ fixtureId: string; cycleId: string; kickoffAt: number; rank: number; envelope: JobEnvelope }>;
export type SelectionManifest = Readonly<{
  version: 1; runId: string; runDate: string; sequence: string; selectionHash: string; startInclusive: number; endExclusive: number;
  committedAt: number; partial: boolean; degradedAction: DegradedSelectionAction | null;
  coverage: readonly SelectionCoverage[]; exclusions: readonly Readonly<{ fixtureId: string; reason: string }>[];
  entries: readonly SelectionEntry[];
}>;
