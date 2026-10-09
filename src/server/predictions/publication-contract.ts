import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import type { StoredRevision } from "./history-contract.ts";

export class RevisionPublicationError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "conflicting-request" | "lost-lease" | "eligibility-expired" | "unavailable";
  constructor(reason: RevisionPublicationError["reason"]) {
    super("Revision publication refused or unavailable. Private diagnostics are withheld.");
    this.name = "RevisionPublicationError"; this.reason = reason;
  }
}
export const publicationFail = (reason: RevisionPublicationError["reason"]): never => { throw new RevisionPublicationError(reason); };
export type PublicationFreshness = Readonly<{
  maxAgeMs: number; basis: "generated" | "retrieved" | "provider-updated";
  unknownGeneration: "reject" | "allow-flagged"; unknownUpdate: "reject" | "allow-flagged";
}>;
export type PublicationPolicy = Readonly<{
  version: 1; evidenceRef: string; maxObservationAgeMs: number;
  sources: Readonly<{ ai: PublicationFreshness; "api-football": PublicationFreshness }>;
}>;
/** Original provider observation, never the time a cache entry was read. */
export type PublicationObservation = Readonly<{
  provider: "api-football"; fixtureId: string; externalFixtureId: number; cycleId: string;
  kickoffAt: UtcInstant; status: SettlementStatus;
  retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null; actualStartedAt: UtcInstant | null;
  evidenceRef: string;
}>;
export type PublishRevisionInput = Readonly<{
  attemptKey: string; candidate: ResolvedForecastCandidate; evidenceSnapshotId: string;
  scheduleVersion: number; generationCompletedAt: UtcInstant; observation: PublicationObservation;
}>;
export type PublicationAuthority = Readonly<{
  authorize(input: PublishRevisionInput): void;
  verifyPolicy(policy: PublicationPolicy): boolean;
  /** Proves the actual provider response and original observation timestamps. */
  verifyObservation(observation: PublicationObservation): boolean;
  /** Proves owning job/model pin, evidence, source receipts, rights and grounding. No I/O here. */
  verifyCandidate(input: PublishRevisionInput, now: UtcInstant): boolean;
}>;
export type PublicationReason = "accepted" | "no-valid-family" | "not-selected" | "outside-window" | "wrong-cycle" |
  "schedule-changed" | "closed-cycle" | "early-play" | "status-ineligible" | "cutoff-passed" |
  "stale-observation" | "future-observation" | "stale-source" | "older-run";
export type RefreshPublicationResult = Readonly<{
  id: string; requestHash: string; attemptKey: string; runId: string; runSequence: bigint;
  fixtureId: string; cycleId: string; jobId: string; fixtureVersion: bigint;
  outcome: "published" | "retained-previous" | "unavailable" | "skipped";
  reason: PublicationReason; revisionId: string | null; at: UtcInstant;
  evidenceSnapshotId: string; candidateHash: string; generationCompletedAt: UtcInstant;
  policyHash: string; observation: PublicationObservation;
}>;
export type PublicationResult = Readonly<{
  refresh: RefreshPublicationResult; revision: StoredRevision | null; updateDelayed: boolean;
}>;
