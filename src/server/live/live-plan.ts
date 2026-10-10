import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { marketRules } from "../../domain/markets.ts";
import { operatingRules, type RuntimePolicy } from "../config/runtime-policy.ts";
import type { EvidencePolicy } from "../evidence/evidence-contract.ts";
import type { ProviderFallbackPolicy } from "../fallback/fallback-adapter.ts";
import type { ApiFootballBounds } from "../football/api-football-contract.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import type { CutoffPolicy } from "../predictions/cutoff-contract.ts";
import type { LifecyclePolicy } from "../predictions/lifecycle-contract.ts";
import type { PublicationPolicy } from "../predictions/publication-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import type { RefreshMember, RefreshPlan } from "../refresh/refresh-contract.ts";
import type { ResultSyncPolicy } from "../results/result-sync-contract.ts";
import type { SelectionPolicy } from "../selection/selection-contract.ts";

const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
export const LIVE_REFRESH_TYPE = "prediction.daily-refresh";
/** Each fallback-only refresh dispatches one prediction and one fresh status request. */
export const REFRESH_REQUESTS_PER_JOB = 2;
const SELECTION_REQUESTS = 14; // Seven dates with one retry each.
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export type LiveWorkload = Readonly<{
  dailyLimit: number; refreshCapacity: number; refreshFloor: number; workers: number; importDays: number;
  cadence: NonNullable<ResultSyncPolicy["cadence"]>; unresolved: ResultSyncPolicy["unresolved"]; corrections: ResultSyncPolicy["corrections"];
  maxBatchesPerTick: number;
}>;
/** Sizes work from the verified account limit so a plan change needs no code change.
 * A quarter of the day goes to result polling and refresh jobs stop above a floor
 * that keeps tomorrow's selection and result checks possible. */
export function liveWorkload(dailyLimit: number, secondLimit: number, plan = ""): LiveWorkload {
  const usable = Math.min(dailyLimit, operatingRules.football.requestsPerProviderDay);
  const resultsShare = Math.max(4, Math.floor(usable * 0.25));
  const dateMs = clamp(Math.ceil(DAY / resultsShare / MINUTE) * MINUTE, MINUTE, 2 * HOUR);
  const activeMs = dateMs;
  const reserve = Math.max(SELECTION_REQUESTS, Math.floor(usable * 0.1));
  const refreshCapacity = clamp(Math.floor((usable - SELECTION_REQUESTS - resultsShare - reserve) / REFRESH_REQUESTS_PER_JOB), 0, 2000);
  return Object.freeze({
    dailyLimit, refreshCapacity, refreshFloor: Math.min(usable, resultsShare + reserve), workers: clamp(Math.floor(secondLimit / 2), 1, 6),
    // API-Football's free plan serves date queries only around today (observed coverage-error beyond tomorrow).
    importDays: plan.trim().toLowerCase() === "free" ? 2 : 7,
    // The 15-second shared live feed costs ~5,760 requests on a busy day; smaller plans observe live status through date sync.
    cadence: Object.freeze({ liveMs: usable >= 20_000 ? operatingRules.refresh.livePollSeconds * SECOND : null, dateMs, activeMs }),
    unresolved: Object.freeze([{ untilAgeMs: DAY, intervalMs: Math.max(5 * MINUTE, 2 * activeMs) },
      { untilAgeMs: 7 * DAY, intervalMs: Math.max(HOUR, 6 * activeMs) }]),
    corrections: Object.freeze([{ untilAgeMs: 6 * HOUR, intervalMs: Math.max(10 * MINUTE, 2 * activeMs) },
      { untilAgeMs: 3 * DAY, intervalMs: Math.max(6 * HOUR, 6 * activeMs) }]),
    maxBatchesPerTick: usable >= 20_000 ? 10 : 2,
  });
}

export type LiveReferences = Readonly<{
  selection: string; retention: string; degradation: string; evidence: string; freshness: string;
  publicRights: string; lifecycle: string; cutoff: string; results: string; refresh: string;
}>;
/** Policy evidence references come from owner-approved runtime configuration. */
export function liveReferences(policy: RuntimePolicy): LiveReferences {
  const { choices } = policy;
  const required = (value: string | null, field: string) => { if (value === null) throw new Error(`Missing ${field}.`); return value; };
  const evidence = required(choices.evidencePolicyRef, "GOAL_HINT_EVIDENCE_POLICY_REF");
  const freshness = required(choices.freshnessPolicyRef, "GOAL_HINT_FRESHNESS_POLICY_REF");
  const integrity = required(choices.pipelineIntegrityRef, "GOAL_HINT_PIPELINE_INTEGRITY_REF");
  return Object.freeze({ selection: integrity, retention: required(choices.football.privateUseRef, "GOAL_HINT_FOOTBALL_PRIVATE_USE_REF"),
    degradation: `${integrity}#degraded-imports`, evidence, freshness,
    publicRights: required(choices.football.publicRightsRef, "GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF"),
    lifecycle: `${freshness}#lifecycle`, cutoff: `${integrity}#cutoff`, results: `${freshness}#results`, refresh: `${integrity}#refresh` });
}

export const refreshEnvelope = Object.freeze({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, maxAttempts: 16, timeoutMs: 120_000,
  leaseMs: 30_000, fallbackReserveMs: 60_000, backoff: Object.freeze({ baseMs: MINUTE, maxMs: HOUR }) });
export function selectionPolicy(policy: RuntimePolicy, refs: LiveReferences, workload: LiveWorkload): SelectionPolicy {
  const competitionIds = policy.choices.competitionIds;
  if (competitionIds === null) throw new Error("Missing GOAL_HINT_COMPETITION_IDS.");
  return Object.freeze({ version: 1, evidenceRef: refs.selection, competitionIds, eligibleStatuses: ["scheduled"] as const,
    degradationPolicyRef: refs.degradation, retentionEvidenceRef: refs.retention, leaseMs: 120_000, attemptsPerInvocation: 2,
    maxFixtures: 10_000, refreshCapacity: workload.refreshCapacity, ...(workload.importDays < 7 ? { importDays: workload.importDays } : {}),
    importBounds: { priority: "daily-inputs" as const, deadlineMs: 10 * MINUTE, timeoutMs: 30 * SECOND, maxRequests: 2, maxPages: 1,
      maxRows: 5000, maxResponseBytes: 40_000_000, retry: { maxAttempts: 6, baseDelayMs: 2 * SECOND, maxDelayMs: 10 * SECOND }, cacheMaxAgeMs: 0 },
    refresh: { ...refreshEnvelope, payload: { policyRef: refs.refresh } } });
}
export const selectionTriggerBounds = Object.freeze({ maxAttempts: 16, timeoutMs: 45 * MINUTE, leaseMs: MINUTE, fallbackReserveMs: 0,
  backoff: Object.freeze({ baseMs: MINUTE, maxMs: HOUR }), expiresAfterMs: 2 * DAY }) satisfies
  Pick<JobEnvelope, "maxAttempts" | "timeoutMs" | "leaseMs" | "fallbackReserveMs" | "backoff"> & Readonly<{ expiresAfterMs: number }>;
export function cutoffPolicy(refs: LiveReferences): CutoffPolicy {
  return Object.freeze({ version: 1, evidenceRef: refs.cutoff, job: { priority: 255, maxAttempts: 16, timeoutMs: MINUTE,
    leaseMs: 30 * SECOND, backoff: { baseMs: 5 * SECOND, maxMs: 5 * MINUTE } } });
}
/** The same provider status vocabulary the adapter normalizes. */
export const providerStatusMappings = Object.freeze([
  ["TBD", "scheduled"], ["NS", "scheduled"], ["1H", "live"], ["HT", "live"], ["2H", "live"], ["ET", "live"], ["BT", "live"],
  ["P", "live"], ["INT", "live"], ["SUSP", "live"], ["LIVE", "live"], ["FT", "finished-regulation"], ["AET", "finished-extra-time"],
  ["PEN", "finished-penalties"], ["PST", "postponed"], ["CANC", "canceled"], ["ABD", "abandoned"], ["AWD", "awarded"], ["WO", "awarded"],
].map(([providerStatus, status]) => Object.freeze({ providerStatus: providerStatus!, status: status! as LifecyclePolicy["mappings"][number]["status"] })));
export function lifecyclePolicy(refs: LiveReferences): LifecyclePolicy {
  return Object.freeze({ version: 1, evidenceRef: refs.lifecycle, ordering: "retrieval-and-provider-update", unknownUpdate: "use-retrieval",
    conflictResolution: "newer-verified-observation", mappings: providerStatusMappings });
}
export function publicationPolicy(refs: LiveReferences): PublicationPolicy {
  return Object.freeze({ version: 1, evidenceRef: refs.freshness, maxObservationAgeMs: 2 * MINUTE, sources: {
    ai: { maxAgeMs: 6 * HOUR, basis: "generated", unknownGeneration: "reject", unknownUpdate: "allow-flagged" },
    "api-football": { maxAgeMs: HOUR, basis: "retrieved", unknownGeneration: "allow-flagged", unknownUpdate: "allow-flagged" } } } as const);
}
export function evidencePolicy(refs: LiveReferences): EvidencePolicy {
  const freshness = { maxAgeMs: 7 * DAY, basis: "retrieved", unknownTimestamp: "exclude", conflicts: "preserve" } as const;
  return Object.freeze({ version: "goal-hint-fallback-evidence-v1", evidenceRef: refs.evidence, freshness: { football: freshness, news: freshness },
    // Provider fallback needs no primary evidence; minimums apply once AI analysis is enabled.
    minimum: { historyPerTeam: 0, formPerTeam: 0, statisticsPerTeam: 0, requireVenue: false, requireRest: false, newsSources: 0 },
    bounds: { maxSources: 100, maxClaimsPerSource: 100, maxSummaryCharacters: 500, maxTitleCharacters: 500,
      maxPublisherCharacters: 100, maxValueCharacters: 500, maxSourceBytes: 20_000, maxSnapshotBytes: 200_000 } });
}
export function providerFallbackPolicy(refs: LiveReferences): ProviderFallbackPolicy {
  const freshness = (maxRetrievalAgeMs: number) => ({ maxRetrievalAgeMs, maxSourceAgeMs: 2 * DAY,
    unknownUpdateTime: "retrieval-only" as const, evidenceRef: refs.freshness });
  return Object.freeze({ version: "goal-hint-provider-fallback-v1", evidenceRef: refs.freshness, sourceEvidenceRef: refs.publicRights,
    // Canonical fixtures come from the daily import; predictions must be fetched within this refresh.
    fixtureFreshness: freshness(2 * DAY), predictionFreshness: freshness(10 * MINUTE), unknownGenerationTime: "allow-flagged",
    matchResultMapping: { sourceField: "predictions.percent" as const, probabilityUnits: "percent" as const, period: marketRules.period,
      completeProbabilities: true as const, evidenceRef: refs.freshness },
    sourceUrl: "https://www.api-football.com/documentation-v3" });
}
export function resultSyncPolicy(refs: LiveReferences, workload: LiveWorkload,
  coverage: ResultSyncPolicy["coverage"]): ResultSyncPolicy {
  return Object.freeze({ version: 1, evidenceRef: refs.results, coverage, approachMs: 15 * MINUTE, activeWindowMs: 3 * HOUR,
    unresolved: workload.unresolved, corrections: workload.corrections, cadence: workload.cadence, leaseMs: MINUTE, tickMs: 5 * SECOND,
    maxBatchesPerTick: workload.maxBatchesPerTick, failureBaseMs: MINUTE, failureMaxMs: HOUR, requestWindowMs: 30 * SECOND,
    request: { timeoutMs: 20 * SECOND, maxRequests: 1, maxPages: 1, maxRows: 5000, maxResponseBytes: 40_000_000,
      retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 5 * SECOND }, cacheMaxAgeMs: 0 } });
}

const single = (priority: ApiFootballBounds["priority"], deadlineAt: UtcInstant, timeoutMs: number, maxResponseBytes: number,
  cacheScope?: string): ApiFootballBounds => Object.freeze({ priority, deadlineAt, timeoutMs, maxRequests: 1, maxPages: 1, maxRows: 1,
  // Retries only wait out limiter pacing: one request allowance means one dispatch.
  maxResponseBytes, retry: { maxAttempts: 8, baseDelayMs: 250, maxDelayMs: 2000 }, cacheMaxAgeMs: 0, ...(cacheScope ? { cacheScope } : {}) });
/** One fallback-only refresh: no AI dispatch, one provider prediction and one fresh status read. */
export function fallbackRefreshPlan(member: RefreshMember, refs: LiveReferences): RefreshPlan {
  const envelope = member.entry.envelope;
  const hardDeadline = utcInstantFromEpochMilliseconds(Math.min(envelope.expiresAt, member.now + envelope.timeoutMs, member.cycle.cutoffAt));
  return Object.freeze({ version: 1, evidenceRef: refs.refresh, modelVersionId: null,
    evidence: { requestId: refreshReference(member.jobId, "evidence"), context: member.context, policy: evidencePolicy(refs),
      footballPlan: null, researchPlan: null, cachedSources: [], maxElapsedMs: 10 * SECOND },
    ai: null,
    fallback: { bounds: single("near-kickoff-fallback", hardDeadline, 20 * SECOND, 2_000_000, member.jobId), maxElapsedMs: 25 * SECOND },
    observation: { bounds: single("results-cutoff", hardDeadline, 15 * SECOND, 2_000_000), maxAgeMs: 2 * MINUTE },
    publicationReserveMs: 10 * SECOND, footballRequestLimit: REFRESH_REQUESTS_PER_JOB });
}
