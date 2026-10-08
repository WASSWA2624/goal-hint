import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { ApiFootballBounds, ApiFootballResult } from "./api-football-contract.ts";
import type { FixtureQuery, TeamQuery, CompetitionQuery, PlayerStatisticsQuery } from "./api-football-adapter.ts";

export const PROVIDER_TRIAL_VERSION = 1;
export const trialCases = ["league", "cup", "low-coverage", "postponed", "cross-midnight", "extra-time", "shootout", "prematch", "status-transition", "identity"] as const;
export type TrialCase = typeof trialCases[number];
export type TrialOperation =
  | Readonly<{ kind: "fixtures"; query: FixtureQuery }>
  | Readonly<{ kind: "live" }>
  | Readonly<{ kind: "account-status" }>
  | Readonly<{ kind: "fixture-ids"; ids: readonly number[] }>
  | Readonly<{ kind: "teams"; query: TeamQuery }>
  | Readonly<{ kind: "competitions"; query: CompetitionQuery }>
  | Readonly<{ kind: "player-statistics"; query: PlayerStatisticsQuery }>
  | Readonly<{ kind: "statistics" | "lineups" | "injuries" | "predictions"; fixtureId: number }>;
export type TrialTask = Readonly<{
  id: string;
  case: TrialCase;
  operation: TrialOperation;
  /** Maximum charged requests for this task, including retries/pages. */
  maxRequests: number;
  /** A prior fixture observation supplies independently retrieved pre-match context. */
  fixtureTaskId?: string;
  /** Explicitly timed observations resume later; the command does not poll or sleep until then. */
  notBefore?: UtcInstant;
}>;
export type TrialRequirement =
  | "candidate-competitions" | "trial-allowance" | "pagination" | "canonical-identities" | "aliases"
  | "league-sample" | "cup-sample" | "low-coverage-sample" | "postponed-sample"
  | "cross-midnight-sample" | "extra-time-sample" | "shootout-sample" | "status-transitions"
  | "field-coverage" | "provider-update-times" | "regulation-scores"
  | "fallback-match-result" | "fallback-double-chance" | "fallback-total-goals" | "fallback-btts"
  | "fallback-prematch" | "fallback-freshness" | "account-plan" | "account-limits"
  | "quota-headers" | "provider-reset" | "subscription-expiry" | "payable-total"
  | "private-use-rights" | "data-redistribution" | "prediction-redistribution"
  | "remote-logo-rights" | "media-host-restrictions" | "credential-free-logo-urls";
export type TrialEvidence = Readonly<{
  id: string;
  requirement: TrialRequirement;
  kind: "official-source" | "account-record" | "rights-record" | "operator-record" | "synthetic";
  source: string;
  recordedAt: UtcInstant;
  /** A claim is not confirmed until a trusted verifier checks its actual source. */
  value: Readonly<Record<string, string | number | boolean | null>>;
}>;
export type TrialFreshness = Readonly<{
  maxRetrievalAgeMs: number;
  maxSourceAgeMs: number;
  unknownUpdateTime: "reject" | "retrieval-only";
  evidenceRef: string;
}>;
export type TrialPlan = Readonly<{
  version: typeof PROVIDER_TRIAL_VERSION;
  id: string;
  accountId: string | null;
  competitions: readonly Readonly<{ id: number; season: number }>[];
  maxRequests: number | null;
  /** Absolute deadline persists across resumes; restart does not renew it. */
  deadlineAt: UtcInstant | null;
  bounds: Omit<ApiFootballBounds, "deadlineAt" | "maxRequests" | "cacheScope"> | null;
  freshness: TrialFreshness | null;
  tasks: readonly TrialTask[];
  evidence: readonly TrialEvidence[];
}>;
export type TrialObservation = Readonly<{
  taskId: string;
  source: "live-provider" | "synthetic";
  observedAt: UtcInstant;
  result: ApiFootballResult<unknown>;
}>;
export type TrialTaskState = Readonly<{
  id: string;
  status: "running" | "completed" | "uncertain" | "deferred";
  startedAt: UtcInstant;
  finishedAt: UtcInstant | null;
  reservedRequests: number;
  /** Null means a crash left the actual number unknown; the full reservation stays charged. */
  dispatchedRequests: number | null;
  observation: TrialObservation | null;
}>;
export type TrialJournal = Readonly<{
  version: typeof PROVIDER_TRIAL_VERSION;
  planHash: string;
  plan: TrialPlan;
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
  tasks: readonly TrialTaskState[];
}>;
export type TrialFinding = Readonly<{
  requirement: TrialRequirement;
  status: "confirmed" | "failed" | "untested";
  sources: readonly string[];
  testedAt: UtcInstant | null;
  result: string;
  limitation: string;
  followUp: string;
}>;
export type TrialReport = Readonly<{
  version: typeof PROVIDER_TRIAL_VERSION;
  trialId: string;
  generatedAt: UtcInstant;
  liveSuitability: "incomplete" | "failed" | "qualified";
  budget: Readonly<{ allowance: number | null; chargedRequests: number; knownDispatchedRequests: number; uncertainTasks: number }>;
  findings: readonly TrialFinding[];
  catalogImplementation: "permitted-with-pending-live-evidence";
  liveOperations: "blocked" | "qualified";
  launch: "blocked";
}>;
