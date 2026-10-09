import "server-only";

import { createPredictionWindow, getReportingDate, isInWindow, type UtcInstant } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import type { ForecastTimestamps } from "../fallback/fallback-contract.ts";
import type { StoredCycle, StoredRevision } from "./history-contract.ts";
import type { PublicationFreshness, PublicationObservation, PublicationReason } from "./publication-contract.ts";

export const observationShowsPlay = (value: PublicationObservation): boolean =>
  value.actualStartedAt !== null || statusShowsPlay(value.status);
export const statusShowsPlay = (status: string): boolean => status === "live" || isPlayedFinalStatus(status as SettlementStatus);

/** Shared with later cutoff/lifecycle services; outcome scores never participate. */
export function revisionEligibleForSchedule(revision: StoredRevision, cycle: StoredCycle, earlierCloseAt: UtcInstant | null): boolean {
  return revision.fixtureId === cycle.fixtureId && revision.cycleId === cycle.id && revision.scheduleVersion <= cycle.scheduleVersion &&
    revision.publishedAt < Math.min(cycle.cutoffAt, earlierCloseAt ?? Infinity);
}
export function publicationEligibility(input: Readonly<{
  now: UtcInstant; cycle: StoredCycle; activeCycleId: string | null; kickoffAt: UtcInstant | null; status: string;
  scheduleVersion: number; candidateKickoffAt: UtcInstant; originalWindow: Readonly<{ startInclusive: UtcInstant; endExclusive: UtcInstant }>;
  observation: PublicationObservation; maxObservationAgeMs: number; earlierCloseAt: UtcInstant | null;
}>): PublicationReason | null {
  const { cycle, observation, now } = input;
  if (input.activeCycleId !== cycle.id) return "wrong-cycle";
  if (cycle.state !== "open") return "closed-cycle";
  if (input.earlierCloseAt !== null || observationShowsPlay(observation) || statusShowsPlay(input.status)) return "early-play";
  if (input.scheduleVersion !== cycle.scheduleVersion || input.candidateKickoffAt !== cycle.kickoffAt ||
    input.kickoffAt !== cycle.kickoffAt || observation.kickoffAt !== cycle.kickoffAt) return "schedule-changed";
  if (!isInWindow(cycle.kickoffAt, input.originalWindow) || !isInWindow(cycle.kickoffAt, createPredictionWindow(getReportingDate(now)))) return "outside-window";
  if (now >= cycle.cutoffAt) return "cutoff-passed";
  if (observation.retrievedAt > now) return "future-observation";
  if (now - observation.retrievedAt > input.maxObservationAgeMs) return "stale-observation";
  if (input.status !== "scheduled" || observation.status !== "scheduled") return "status-ineligible";
  return null;
}
export function publicationSourceIsFresh(timestamps: ForecastTimestamps, policy: PublicationFreshness, now: UtcInstant): boolean {
  if (timestamps.retrievedAt > now || timestamps.generatedAt === null && policy.unknownGeneration === "reject" ||
    timestamps.providerUpdatedAt === null && policy.unknownUpdate === "reject") return false;
  const at = policy.basis === "generated" ? timestamps.generatedAt : policy.basis === "provider-updated" ? timestamps.providerUpdatedAt : timestamps.retrievedAt;
  const basis = at ?? timestamps.retrievedAt;
  return basis <= now && now - basis <= policy.maxAgeMs;
}
