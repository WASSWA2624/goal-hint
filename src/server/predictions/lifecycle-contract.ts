import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { NormalizedFixture } from "../football/api-football-normalize.ts";

export class ScheduleLifecycleError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "identity-unresolved" | "unavailable";
  constructor(reason: ScheduleLifecycleError["reason"]) {
    super("Schedule observation refused or unavailable. Private diagnostics are withheld.");
    this.name = "ScheduleLifecycleError"; this.reason = reason;
  }
}
export const lifecycleFail = (reason: ScheduleLifecycleError["reason"]): never => { throw new ScheduleLifecycleError(reason); };
export type LifecyclePolicy = Readonly<{
  version: 1; evidenceRef: string;
  ordering: "retrieval-and-provider-update";
  unknownUpdate: "use-retrieval" | "hold";
  conflictResolution: "newer-verified-observation";
  mappings: readonly Readonly<{ providerStatus: string; status: SettlementStatus }>[];
}>;
export type LifecycleInput = Readonly<{
  fixtureId: string; fixture: NormalizedFixture; actualStartedAt: UtcInstant | null;
  actor: string; evidenceRef: string;
}>;
/** A bounded projection of normalized data; no raw response, names, media or credentials. */
export type LifecycleObservation = Readonly<{
  fixtureId: string; externalFixtureId: number; homeExternalId: number; awayExternalId: number;
  competitionExternalId: number; season: number | null;
  kickoffAt: UtcInstant | null; status: SettlementStatus; providerStatus: string | null;
  actualStartedAt: UtcInstant | null; elapsedMinutes: number | null;
  retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null; endpoint: string;
  reportedGoals: Readonly<{ home: number | null; away: number | null }>;
  regulationScore: NormalizedFixture["regulationScore"];
  extraTimeScore: Readonly<{ home: number | null; away: number | null }>;
  penaltyScore: Readonly<{ home: number | null; away: number | null }>;
  actor: string; evidenceRef: string;
}>;
export type LifecycleReceipt = Readonly<{
  id: string; fixtureId: string; cycleId: string | null; fixtureVersion: bigint;
  at: UtcInstant; outcome: "accepted" | "unchanged" | "stale" | "conflict";
  reason: string; policyHash: string; observation: LifecycleObservation;
}>;
export type LifecycleAuthority = Readonly<{
  authorize(observation: LifecycleObservation): void;
  verifyPolicy(policy: LifecyclePolicy): boolean;
  verifyObservation(observation: LifecycleObservation): boolean;
}>;
