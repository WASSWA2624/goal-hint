import "server-only";

import { isDecimalOddsValue } from "../../domain/odds.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";

export type ContextClaim = Readonly<{
  id: string; category: "availability" | "lineup" | "weather" | "pitch" | "travel" | "security" | "tactics" | "manager";
  classification: "verified" | "credible-report" | "rumour" | "unknown";
  summary: string; sourceUrl: string; observedAt: number; publishedAt: number;
}>;
export type MonitoringObservation = Readonly<{
  fixtureId: string; observedAt: number; receivedAt: number; kickoffAt: number;
  status: "scheduled" | "postponed" | "cancelled" | "started" | "finished" | "unknown";
  confirmedMajorAbsences: readonly string[] | null;
  unexpectedLineup: boolean | null; seriousSecurityIssue: boolean | null;
  context: readonly ContextClaim[] | null;
  odds: Readonly<Record<string, number>> | null;
  probabilities: Readonly<Record<string, number>> | null;
}>;
export type MonitoringPolicy = Readonly<{
  version: string; maximumAgeMs: number; probabilityReviewPoints: number;
  relativeOddsReview: number; nearTermMs: number; nearCheckMs: number; distantCheckMs: number;
}>;
export const DEFAULT_MONITORING_POLICY: MonitoringPolicy = Object.freeze({
  version: "shadow-monitoring-v1", maximumAgeMs: 2 * 60 * 60_000,
  probabilityReviewPoints: 0.05, relativeOddsReview: 0.1,
  nearTermMs: 48 * 60 * 60_000, nearCheckMs: 60 * 60_000, distantCheckMs: 6 * 60 * 60_000,
});
export type ObservationChange = Readonly<{
  severity: "initial" | "unchanged" | "minor" | "significant" | "critical" | "unavailable";
  reasons: readonly string[]; hash: string | null; suspend: boolean;
  recomputeLocal: boolean; contextualReview: boolean;
}>;
const validTime = (value: number) => Number.isSafeInteger(value) && value >= 0;
function semanticClaim(claim: ContextClaim) {
  return { id: claim.id, category: claim.category, classification: claim.classification, summary: claim.summary,
    sourceUrl: claim.sourceUrl, publishedAt: claim.publishedAt };
}
function checkedPolicy(policy: MonitoringPolicy): MonitoringPolicy {
  if (!policy.version || ![policy.maximumAgeMs, policy.nearTermMs, policy.nearCheckMs, policy.distantCheckMs].every((n) => Number.isSafeInteger(n) && n > 0) ||
      !Number.isFinite(policy.probabilityReviewPoints) || policy.probabilityReviewPoints <= 0 || policy.probabilityReviewPoints > 1 ||
      !Number.isFinite(policy.relativeOddsReview) || policy.relativeOddsReview <= 0 || policy.relativeOddsReview > 1)
    throw new Error("Invalid shadow monitoring policy.");
  return policy;
}
/** Retrieval/check clocks are audit facts, not a reason to create another forecast. */
export function observationFingerprint(observation: MonitoringObservation): string {
  return evidenceFingerprint({ ...observation, receivedAt: null, observedAt: null,
    confirmedMajorAbsences: observation.confirmedMajorAbsences === null ? null : [...new Set(observation.confirmedMajorAbsences)].sort(),
    context: observation.context === null ? null : [...new Map(observation.context.map((claim) => [claim.id, semanticClaim(claim)])).values()].sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function validateMonitoringObservation(observation: MonitoringObservation, now: number): boolean {
  if (!observation.fixtureId || !validTime(now) || !validTime(observation.observedAt) || !validTime(observation.receivedAt) || !validTime(observation.kickoffAt) ||
      observation.observedAt > observation.receivedAt || observation.receivedAt > now ||
      !["scheduled", "postponed", "cancelled", "started", "finished", "unknown"].includes(observation.status) ||
      observation.confirmedMajorAbsences !== null && (!Array.isArray(observation.confirmedMajorAbsences) || observation.confirmedMajorAbsences.some((id) => typeof id !== "string" || !id)) ||
      observation.unexpectedLineup !== null && typeof observation.unexpectedLineup !== "boolean" ||
      observation.seriousSecurityIssue !== null && typeof observation.seriousSecurityIssue !== "boolean") return false;
  if (observation.odds !== null && Object.values(observation.odds).some((value) => !isDecimalOddsValue(value)) ||
      observation.probabilities !== null && Object.values(observation.probabilities).some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return false;
  const claims = new Map<string, string>();
  return observation.context === null || Array.isArray(observation.context) && observation.context.every((claim) => {
    try {
      const url = new URL(claim.sourceUrl);
      const hash = evidenceFingerprint(semanticClaim(claim)), existing = claims.get(claim.id);
      if (existing !== undefined && existing !== hash) return false;
      claims.set(claim.id, hash);
      return Boolean(claim.id && claim.summary) && ["https:", "http:"].includes(url.protocol) &&
        ["availability", "lineup", "weather", "pitch", "travel", "security", "tactics", "manager"].includes(claim.category) &&
        ["verified", "credible-report", "rumour", "unknown"].includes(claim.classification) && validTime(claim.observedAt) &&
        validTime(claim.publishedAt) && claim.publishedAt <= claim.observedAt && claim.observedAt <= observation.observedAt;
    } catch { return false; }
  });
}
export function classifyObservationChange(previous: MonitoringObservation | null, next: MonitoringObservation | null,
  now: number, selected: MonitoringPolicy = DEFAULT_MONITORING_POLICY): ObservationChange {
  const policy = checkedPolicy(selected);
  const result = (severity: ObservationChange["severity"], reasons: string[], hash: string | null, suspend = false, contextualReview = false): ObservationChange =>
    Object.freeze({ severity, reasons: Object.freeze(reasons), hash, suspend,
      recomputeLocal: ["initial", "significant", "critical"].includes(severity), contextualReview });
  if (next === null || !validateMonitoringObservation(next, now) || now - next.observedAt > policy.maximumAgeMs || next.status === "unknown")
    return result("unavailable", ["missing-stale-or-invalid-observation"], null, true);
  if (previous && (next.fixtureId !== previous.fixtureId || next.observedAt < previous.observedAt))
    return result("unavailable", ["wrong-fixture-or-older-observation"], null, true);
  const hash = observationFingerprint(next);
  const critical: string[] = [];
  if (next.status !== "scheduled") critical.push(`fixture-${next.status}`);
  if (next.seriousSecurityIssue === true) critical.push("serious-security-issue");
  if (next.unexpectedLineup === true) critical.push("unexpected-lineup");
  if (previous && next.kickoffAt !== previous.kickoffAt) critical.push("kickoff-changed");
  if (next.confirmedMajorAbsences?.length) critical.push("confirmed-major-absence");
  if (previous && hash === observationFingerprint(previous)) return result("unchanged", critical, hash, critical.length > 0);
  if (critical.length) return result("critical", critical, hash, true, next.seriousSecurityIssue === true || next.unexpectedLineup === true);
  if (!previous) return result("initial", ["baseline-required"], hash);
  // Losing a field is missing evidence, never proof that a formerly known fact is unchanged.
  if ((["confirmedMajorAbsences", "unexpectedLineup", "seriousSecurityIssue", "context", "odds", "probabilities"] as const)
    .some((key) => previous[key] !== null && next[key] === null) ||
    (["odds", "probabilities"] as const).some((key) => previous[key] !== null && next[key] !== null &&
      Object.keys(previous[key]!).some((entry) => next[key]![entry] === undefined)))
    return result("unavailable", ["previously-known-evidence-missing"], hash, true);
  if (previous.context?.some((claim) => !next.context?.some((current) => current.id === claim.id)))
    return result("unavailable", ["previously-known-context-missing"], hash, true);
  const reasons: string[] = [];
  if (previous.status !== next.status) reasons.push("fixture-status-recovered");
  if (evidenceFingerprint(next.confirmedMajorAbsences) !== evidenceFingerprint(previous.confirmedMajorAbsences) ||
      next.unexpectedLineup !== previous.unexpectedLineup || next.seriousSecurityIssue !== previous.seriousSecurityIssue)
    reasons.push("availability-changed");
  if (next.probabilities && previous.probabilities && Object.entries(next.probabilities).some(([key, value]) =>
    previous.probabilities![key] !== undefined && Math.abs(value - previous.probabilities![key]!) + 1e-12 >= policy.probabilityReviewPoints)) reasons.push("local-probability-review-trigger");
  if (next.odds && previous.odds && Object.entries(next.odds).some(([key, value]) =>
    previous.odds![key] !== undefined && Math.abs(value / previous.odds![key]! - 1) + 1e-12 >= policy.relativeOddsReview)) reasons.push("substantial-odds-shift");
  const claimHash = (claim: ContextClaim) => evidenceFingerprint(semanticClaim(claim));
  const oldClaims = new Map(previous.context?.map((claim) => [claim.id, claimHash(claim)]) ?? []);
  const credibleChange = next.context?.some((claim) => ["verified", "credible-report"].includes(claim.classification) &&
    oldClaims.get(claim.id) !== claimHash(claim)) ?? false;
  if (credibleChange) reasons.push("credible-context-change");
  return result(reasons.length ? "significant" : "minor", reasons.length ? reasons : ["immaterial-or-unverified-change"], hash, false, credibleChange);
}
/** Account endpoint/batching/quota/cache permission must be verified before scheduling external work. */
export function planMonitoringCheck(input: Readonly<{
  now: number; kickoffAt: number; lastCheckedAt: number | null; publishedSlip: boolean; capabilitiesVerified: boolean;
  policy?: MonitoringPolicy;
}>) {
  const policy = checkedPolicy(input.policy ?? DEFAULT_MONITORING_POLICY);
  if (![input.now, input.kickoffAt].every(validTime) || input.lastCheckedAt !== null && (!validTime(input.lastCheckedAt) || input.lastCheckedAt > input.now))
    throw new Error("Invalid shadow monitoring time.");
  const cutoffAt = input.kickoffAt - 5 * 60_000;
  if (!input.capabilitiesVerified || input.now >= cutoffAt) return { due: false, nextCheckAt: null, priority: input.publishedSlip ? 0 : 1 } as const;
  const interval = input.publishedSlip || input.kickoffAt - input.now <= policy.nearTermMs ? policy.nearCheckMs : policy.distantCheckMs;
  const nextCheckAt = input.lastCheckedAt === null ? input.now : Math.min(input.lastCheckedAt + interval, cutoffAt);
  return { due: input.now >= nextCheckAt, nextCheckAt, priority: input.publishedSlip ? 0 : 1 } as const;
}
export type ShadowBudget = Readonly<{
  dayRemainingRequests: number; monthRemainingRequests: number;
  dayRemainingUsdPicos: bigint; monthRemainingUsdPicos: bigint;
  maximumRequests: number; maximumUsdPicos: bigint;
}>;
/** This is an extra admission gate; the existing atomic cost/quota gateway still owns reservation and dispatch. */
export function admitContextReview(input: Readonly<{
  change: ObservationChange; authorizedSources: boolean; configured: boolean; budget: ShadowBudget;
  circuitOpenUntil: number | null; now: number;
}>) {
  const { budget } = input;
  if (!validTime(input.now) || ![budget.dayRemainingRequests, budget.monthRemainingRequests, budget.maximumRequests].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    [budget.dayRemainingUsdPicos, budget.monthRemainingUsdPicos, budget.maximumUsdPicos].some((n) => typeof n !== "bigint" || n < 0n) ||
    input.circuitOpenUntil !== null && !validTime(input.circuitOpenUntil)) return { allowed: false, reason: "invalid-budget" } as const;
  if (!input.configured || !input.authorizedSources) return { allowed: false, reason: "unconfigured-or-unauthorized" } as const;
  if (!input.change.contextualReview) return { allowed: false, reason: "context-review-not-justified" } as const;
  if (input.circuitOpenUntil !== null && input.now < input.circuitOpenUntil) return { allowed: false, reason: "circuit-open" } as const;
  if (budget.maximumRequests < 1 || budget.maximumRequests > budget.dayRemainingRequests || budget.maximumRequests > budget.monthRemainingRequests ||
    budget.maximumUsdPicos > budget.dayRemainingUsdPicos || budget.maximumUsdPicos > budget.monthRemainingUsdPicos)
    return { allowed: false, reason: "budget-exhausted" } as const;
  return { allowed: true, reason: "reserve-through-existing-gateway" } as const;
}
export function monitoringRetry(attempt: number, now: number, cutoffAt: number) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !validTime(now) || !validTime(cutoffAt)) throw new Error("Invalid monitoring retry.");
  const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempt - 1, 10));
  return { retryAt: attempt > 6 || now + delayMs >= cutoffAt ? null : now + delayMs,
    circuitOpenUntil: attempt >= 3 ? now + delayMs : null } as const;
}
