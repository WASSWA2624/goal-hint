import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { marketRules } from "../../domain/markets.ts";
import { operatingRules, type RuntimePolicy } from "../config/runtime-policy.ts";
import type { EvidencePolicy } from "../evidence/evidence-contract.ts";
import type { ProviderFallbackPolicy } from "../fallback/fallback-adapter.ts";
import { ODDS_CONTRACT_VERSION, type ApiFootballBounds } from "../football/api-football-contract.ts";
import { DE_MARGIN_METHOD } from "../../domain/odds.ts";
import { ODDS_MAPPING_VERSION } from "../../domain/odds-markets.ts";
import type { OddsImportKind, OddsPolicy } from "../odds/odds-contract.ts";
import { ODDS_SWEEP_MS } from "../odds/odds-jobs.ts";
import { TEAM_CODES_REQUESTS_PER_SEASON } from "../teams/team-code-jobs.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import type { CutoffPolicy } from "../predictions/cutoff-contract.ts";
import type { LifecyclePolicy } from "../predictions/lifecycle-contract.ts";
import type { PublicationPolicy } from "../predictions/publication-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import { refreshFail, type RefreshMember, type RefreshPlan } from "../refresh/refresh-contract.ts";
import type { ResultSyncPolicy } from "../results/result-sync-contract.ts";
import type { LiveMatchPolicy } from "../live-match/live-match-contract.ts";
import type { SelectionPolicy } from "../selection/selection-contract.ts";

const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
export const LIVE_REFRESH_TYPE = "prediction.daily-refresh";
/** Each fallback-only refresh dispatches one prediction and one fresh status request. */
export const REFRESH_REQUESTS_PER_JOB = 2;
/** The edge day makes seven visitor-local dates available across time zones. */
export const LIVE_FORECAST_WINDOW_DAYS = 8;
const SELECTION_REQUESTS = LIVE_FORECAST_WINDOW_DAYS * 2;
/** Odds stay off below this many spare ordinary requests per provider day. */
export const ODDS_MINIMUM_SPARE = 200;
/** Pages per odds date sweep (10 fixtures per page, per the documented contract). */
export const ODDS_MAX_PAGES = 150;
/** OP-07 default for odds: a price must be reconfirmed within 12 hours before kickoff. */
export const ODDS_FRESHNESS_MS = 12 * 60 * 60_000;
/** OP-08/OP-31 default: normalized snapshots are retained until kickoff plus 30 days (no purge job exists). */
export const ODDS_RETAIN_AFTER_KICKOFF_MS = 30 * 24 * 60 * 60_000;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/** "slow" plans allow under one request per second, so a provider call may wait most of a rolling minute for a slot. */
export type RefreshPacing = "standard" | "slow";
/** Odds share of the provider day (052). `floor` is every ordinary need of the day and `spare` the odds budget above
 * it; `reserve` is the ordinary slack odds never take, even when ordinary work runs past its plan. The team-code import
 * spends from the same spare under the same gate and eligibility, so together they never exceed it. */
export type OddsWorkload = Readonly<{ floor: number; spare: number; reserve: number; eligible: boolean; sweepMs: number; dates: number; maxPages: number }>;
export type LiveDetailsWorkload = Readonly<{ eligible: boolean; requests: number; floor: number; reserve: number;
  intervalMs: number; finalIntervalMs: number; finalWindowMs: number; maxFixturesPerTick: number }>;
export type LiveWorkload = Readonly<{
  dailyLimit: number; refreshCapacity: number; refreshFloor: number; workers: number; importDays: number;
  pacing: RefreshPacing; refreshLeadMs: number; odds: OddsWorkload;
  primaryEnabled: boolean; refreshRequestsPerJob: number;
  liveDetails: LiveDetailsWorkload;
  cadence: NonNullable<ResultSyncPolicy["cadence"]>; unresolved: ResultSyncPolicy["unresolved"]; corrections: ResultSyncPolicy["corrections"];
  maxBatchesPerTick: number;
}>;
/** Sizes work from the verified account limit so a plan change needs no code change.
 * A quarter of the day goes to result polling and refresh jobs stop above a floor
 * that keeps tomorrow's selection and result checks possible. */
export function liveWorkload(dailyLimit: number, secondLimit: number, plan = "", minuteLimit = Number.POSITIVE_INFINITY,
  primaryEnabled = false, liveDetailsEnabled = false): LiveWorkload {
  const usable = Math.min(dailyLimit, operatingRules.football.requestsPerProviderDay);
  const resultsShare = Math.max(4, Math.floor(usable * 0.25));
  const dateMs = clamp(Math.ceil(DAY / resultsShare / MINUTE) * MINUTE, MINUTE, 2 * HOUR);
  const activeMs = dateMs;
  const reserve = Math.max(SELECTION_REQUESTS, Math.floor(usable * 0.1));
  const pacing: RefreshPacing = minuteLimit < 60 ? "slow" : "standard";
  // A detail poll costs one statistics request and one events request. Free/slow plans
  // retain their existing workload; eligible plans reserve this share before enrichment.
  const detailsEligible = liveDetailsEnabled && usable >= 7500 && pacing === "standard" && plan.trim().toLowerCase() !== "free";
  const detailRequests = detailsEligible ? Math.floor(usable * 0.2) : 0;
  const refreshRequestsPerJob = REFRESH_REQUESTS_PER_JOB + (primaryEnabled ? 2 : 0);
  const refreshCapacity = clamp(Math.floor((usable - SELECTION_REQUESTS - resultsShare - reserve - detailRequests) / refreshRequestsPerJob), 0, 2000);
  const workers = clamp(Math.floor(secondLimit / 2), 1, 6);
  // Selected fixtures must still be refreshable once the queue reaches them: skip cutoffs closer than the queue's drain time.
  const refreshLeadMs = clamp(Math.ceil(refreshCapacity / workers) * refreshEnvelopeFor(pacing, primaryEnabled).timeoutMs, 10 * MINUTE, 2 * HOUR);
  const importDays = plan.trim().toLowerCase() === "free" ? 2 : LIVE_FORECAST_WINDOW_DAYS;
  // Daily refresh jobs run 21:00-24:00 UTC, at the END of the UTC provider day, so the odds floor protects all of
  // them plus selection, results and the reserve, not just the refresh floor. Odds spend at most the spare above it
  // per provider day (the job gate counts odds' own dispatches). Free and slow plans stay ineligible.
  const ordinaryFloor = Math.min(usable, resultsShare + reserve + refreshCapacity * refreshRequestsPerJob + SELECTION_REQUESTS);
  const oddsFloor = Math.min(usable, ordinaryFloor + detailRequests);
  const odds = Object.freeze({ floor: oddsFloor, spare: usable - oddsFloor, reserve: Math.min(oddsFloor, reserve),
    eligible: usable - oddsFloor >= ODDS_MINIMUM_SPARE && pacing === "standard",
    sweepMs: ODDS_SWEEP_MS, dates: Math.min(7, importDays), maxPages: ODDS_MAX_PAGES });
  return Object.freeze({
    dailyLimit, refreshCapacity, refreshFloor: Math.min(usable, resultsShare + reserve), workers, pacing, refreshLeadMs,
    primaryEnabled, refreshRequestsPerJob,
    liveDetails: Object.freeze({ eligible: detailsEligible, requests: detailRequests, floor: ordinaryFloor, reserve: Math.min(ordinaryFloor, reserve),
      intervalMs: MINUTE, finalIntervalMs: 15 * MINUTE, finalWindowMs: 3 * DAY, maxFixturesPerTick: 5 }),
    // API-Football's free plan serves date queries only around today (observed coverage-error beyond tomorrow).
    importDays, odds,
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
  /** Owner policy reference for odds imports, and the optional odds display-rights reference (OP-36). */
  odds: string; oddsRights: string | null;
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
    lifecycle: `${freshness}#lifecycle`, cutoff: `${integrity}#cutoff`, results: `${freshness}#results`, refresh: `${integrity}#refresh`,
    odds: `${freshness}#odds`, oddsRights: choices.odds.rightsRef });
}
/** The exact odds policy for this plan, or null when no documented bookmaker is configured. */
export function oddsPolicy(policy: RuntimePolicy, refs: LiveReferences, workload: LiveWorkload): OddsPolicy | null {
  const bookmakerId = policy.choices.odds.bookmakerId;
  if (bookmakerId === null) return null;
  return Object.freeze({ version: 1, evidenceRef: refs.odds, retentionEvidenceRef: refs.retention, basis: "bookmaker", bookmakerId,
    method: DE_MARGIN_METHOD, mappingVersion: ODDS_MAPPING_VERSION, contractVersion: ODDS_CONTRACT_VERSION, freshnessMs: ODDS_FRESHNESS_MS,
    retainAfterKickoffMs: ODDS_RETAIN_AFTER_KICKOFF_MS, horizonDays: workload.odds.dates, sweepMs: workload.odds.sweepMs });
}
/** Dispatch ceiling of one odds operation (pages plus retries). The job's quota gate requires exactly this much of the
 * day's unspent odds spare before any provider call, so a sweep can never reach the ordinary work of the day. */
export function oddsMaxRequests(kind: OddsImportKind, maxPages: number): number { return kind === "prices" ? maxPages + 4 : 3; }
/** One date sweep at enrichment priority: never the essential reserve, never cached, bounded by the slot. */
export function oddsImportBounds(deadlineAt: UtcInstant, maxPages: number): ApiFootballBounds {
  return Object.freeze({ priority: "enrichment", deadlineAt, timeoutMs: 30 * SECOND, maxRequests: oddsMaxRequests("prices", maxPages), maxPages, maxRows: maxPages * 10,
    // Re-size from the counted odds trial's bytes-per-page evidence.
    maxResponseBytes: 8_000_000, retry: { maxAttempts: 3, baseDelayMs: SECOND, maxDelayMs: 10 * SECOND }, cacheMaxAgeMs: 0 });
}
export function oddsCatalogBounds(deadlineAt: UtcInstant): ApiFootballBounds {
  return Object.freeze({ priority: "enrichment", deadlineAt, timeoutMs: 30 * SECOND, maxRequests: oddsMaxRequests("bets", 1), maxPages: 1, maxRows: 2000,
    maxResponseBytes: 2_000_000, retry: { maxAttempts: 3, baseDelayMs: SECOND, maxDelayMs: 10 * SECOND }, cacheMaxAgeMs: 0 });
}
/** Team-code imports run when the owner has not turned them off AND the verified plan has the odds spare: the same
 * eligibility as odds, so never on Free or slow plans, whatever the switch says. */
export function teamCodeImportsEnabled(policy: RuntimePolicy, workload: LiveWorkload): boolean {
  return policy.choices.teamCodes.enabled && workload.odds.eligible;
}
/** One /teams?league&season import at enrichment priority (the team-code import shares the odds spare). /teams is not
 * paginated; the row and byte bounds leave room for large cup draws. Never cached, at most one retry. */
export function teamCodeBounds(deadlineAt: UtcInstant): ApiFootballBounds {
  return Object.freeze({ priority: "enrichment", deadlineAt, timeoutMs: 25 * SECOND, maxRequests: TEAM_CODES_REQUESTS_PER_SEASON, maxPages: 1,
    maxRows: 1000, maxResponseBytes: 4_000_000, retry: { maxAttempts: TEAM_CODES_REQUESTS_PER_SEASON, baseDelayMs: SECOND, maxDelayMs: 5 * SECOND },
    cacheMaxAgeMs: 0 });
}

export const refreshEnvelope = Object.freeze({ type: LIVE_REFRESH_TYPE, handlerVersion: 1, maxAttempts: 16, timeoutMs: 120_000,
  leaseMs: 30_000, fallbackReserveMs: 60_000, backoff: Object.freeze({ baseMs: MINUTE, maxMs: HOUR }) });
/** Slow plans give both provider calls time to wait out a full rolling minute, plus publication. */
export function refreshEnvelopeFor(pacing: RefreshPacing, primaryEnabled = false) {
  if (primaryEnabled) return Object.freeze({ ...refreshEnvelope,
    timeoutMs: pacing === "slow" ? 8 * MINUTE : 5 * MINUTE,
    fallbackReserveMs: pacing === "slow" ? 200_000 : refreshEnvelope.fallbackReserveMs });
  return pacing === "slow" ? Object.freeze({ ...refreshEnvelope, timeoutMs: 5 * MINUTE, fallbackReserveMs: 200_000 }) : refreshEnvelope;
}
export function selectionPolicy(policy: RuntimePolicy, refs: LiveReferences, workload: LiveWorkload): SelectionPolicy {
  const competitionIds = policy.choices.competitionIds;
  if (competitionIds === null) throw new Error("Missing GOAL_HINT_COMPETITION_IDS.");
  return Object.freeze({ version: 1, evidenceRef: refs.selection, competitionIds, eligibleStatuses: ["scheduled"] as const,
    degradationPolicyRef: refs.degradation, retentionEvidenceRef: refs.retention, leaseMs: 120_000, attemptsPerInvocation: 2,
    maxFixtures: 10_000, windowDays: LIVE_FORECAST_WINDOW_DAYS, refreshCapacity: workload.refreshCapacity,
    ...(workload.importDays < LIVE_FORECAST_WINDOW_DAYS ? { importDays: workload.importDays } : {}),
    refreshLeadMs: workload.refreshLeadMs,
    importBounds: { priority: "daily-inputs" as const, deadlineMs: 10 * MINUTE, timeoutMs: 30 * SECOND, maxRequests: 2, maxPages: 1,
      maxRows: 5000, maxResponseBytes: 40_000_000, retry: { maxAttempts: 6, baseDelayMs: 2 * SECOND, maxDelayMs: 10 * SECOND }, cacheMaxAgeMs: 0 },
    refresh: { ...refreshEnvelopeFor(workload.pacing, workload.primaryEnabled), payload: { policyRef: refs.refresh } } });
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
    ai: { maxAgeMs: 6 * HOUR, basis: "retrieved", unknownGeneration: "allow-flagged", unknownUpdate: "allow-flagged" },
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

/** Dedicated one-fixture endpoints; no batching or provider update timestamp is inferred. */
export function liveMatchPolicy(refs: LiveReferences, workload: LiveWorkload, coverage: LiveMatchPolicy["coverage"]): LiveMatchPolicy {
  return Object.freeze({ version: 1, evidenceRef: `${refs.freshness}#live-match-details`, coverage,
    intervalMs: workload.liveDetails.intervalMs, finalIntervalMs: workload.liveDetails.finalIntervalMs,
    finalWindowMs: workload.liveDetails.finalWindowMs, staleAfterMs: 5 * MINUTE,
    leaseMs: MINUTE, tickMs: 5 * SECOND, maxFixturesPerTick: workload.liveDetails.maxFixturesPerTick, requestWindowMs: 25 * SECOND,
    request: { timeoutMs: 20 * SECOND, maxRequests: 1, maxPages: 1, maxRows: 500, maxResponseBytes: 1_000_000,
      retry: { maxAttempts: 8, baseDelayMs: 250, maxDelayMs: 2 * SECOND }, cacheMaxAgeMs: 0 } });
}

const single = (priority: ApiFootballBounds["priority"], deadlineAt: UtcInstant, timeoutMs: number, maxResponseBytes: number,
  cacheScope?: string, pacing: RefreshPacing = "standard"): ApiFootballBounds => Object.freeze({ priority, deadlineAt, timeoutMs, maxRequests: 1, maxPages: 1, maxRows: 1,
  // Retries only wait out limiter pacing: one request allowance means one dispatch. Slow plans wait for the slot the limiter names.
  maxResponseBytes, retry: pacing === "slow" ? { maxAttempts: 40, baseDelayMs: 1000, maxDelayMs: 5000 } : { maxAttempts: 8, baseDelayMs: 250, maxDelayMs: 2000 },
  cacheMaxAgeMs: 0, ...(cacheScope ? { cacheScope } : {}) });
const refreshTimings = Object.freeze({
  standard: { fallbackTimeoutMs: 20 * SECOND, fallbackMaxMs: 25 * SECOND, observationTimeoutMs: 15 * SECOND },
  slow: { fallbackTimeoutMs: 75 * SECOND, fallbackMaxMs: 80 * SECOND, observationTimeoutMs: 75 * SECOND },
} as const);
const PUBLICATION_RESERVE_MS = 10 * SECOND, EVIDENCE_MAX_MS = 10 * SECOND;
/** One fallback-only refresh: no AI dispatch, one provider prediction and one fresh status read.
 * A cycle whose cutoff is too close for the plan's waits is skipped, not failed: no prediction could publish in time. */
export function fallbackRefreshPlan(member: RefreshMember, refs: LiveReferences, pacing: RefreshPacing = "standard"): RefreshPlan {
  const envelope = member.entry.envelope, timing = refreshTimings[pacing];
  const hardDeadline = utcInstantFromEpochMilliseconds(Math.min(envelope.expiresAt, member.now + envelope.timeoutMs, member.cycle.cutoffAt));
  // Mirrors the refresh plan's own validation: evidence must finish before the reserve that covers both provider calls and publication.
  const providerAndPublicationMs = timing.fallbackMaxMs + timing.observationTimeoutMs + PUBLICATION_RESERVE_MS;
  if (envelope.fallbackReserveMs < providerAndPublicationMs || hardDeadline - member.now < EVIDENCE_MAX_MS + envelope.fallbackReserveMs) {
    refreshFail("ineligible", "insufficient-time");
  }
  return Object.freeze({ version: 1, evidenceRef: refs.refresh, modelVersionId: null,
    evidence: { requestId: refreshReference(member.jobId, "evidence"), context: member.context, policy: evidencePolicy(refs),
      footballPlan: null, researchPlan: null, cachedSources: [], maxElapsedMs: EVIDENCE_MAX_MS },
    ai: null,
    fallback: { bounds: single("near-kickoff-fallback", hardDeadline, timing.fallbackTimeoutMs, 2_000_000, member.jobId, pacing), maxElapsedMs: timing.fallbackMaxMs },
    observation: { bounds: single("results-cutoff", hardDeadline, timing.observationTimeoutMs, 2_000_000, undefined, pacing), maxAgeMs: 2 * MINUTE },
    publicationReserveMs: PUBLICATION_RESERVE_MS, footballRequestLimit: REFRESH_REQUESTS_PER_JOB });
}
