import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { QuotaFeedback, QuotaPriority, QuotaDenialReason } from "./quota-contract.ts";

export const API_FOOTBALL_ORIGIN = "https://v3.football.api-sports.io";
export const API_FOOTBALL_CONTRACT_VERSION = "direct-v3-official-examples-2026-10-08";
export const apiFootballEndpoints = Object.freeze({
  fixtures: Object.freeze({ path: "/fixtures", paginated: false }),
  teams: Object.freeze({ path: "/teams", paginated: false }),
  competitions: Object.freeze({ path: "/leagues", paginated: false }),
  statistics: Object.freeze({ path: "/fixtures/statistics", paginated: false }),
  lineups: Object.freeze({ path: "/fixtures/lineups", paginated: false }),
  injuries: Object.freeze({ path: "/injuries", paginated: false }),
  playerStatistics: Object.freeze({ path: "/players", paginated: true }),
  predictions: Object.freeze({ path: "/predictions", paginated: false }),
  accountStatus: Object.freeze({ path: "/status", paginated: false }),
} as const);
export type ApiFootballEndpoint = keyof typeof apiFootballEndpoints;

/** Explicit caller budgets; no default job allowance, retry budget or freshness policy. */
export type ApiFootballBounds = Readonly<{
  priority: QuotaPriority;
  deadlineAt: UtcInstant;
  timeoutMs: number;
  maxRequests: number;
  maxPages: number;
  maxRows: number;
  maxResponseBytes: number;
  retry: Readonly<{ maxAttempts: number; baseDelayMs: number; maxDelayMs: number }>;
  cacheMaxAgeMs: number;
  /** Required for predictions, so ready-made predictions remain within one fallback job. */
  cacheScope?: string;
}>;
export type ApiFootballErrorReason =
  | "invalid-request" | "invalid-credential" | "operation-not-authorized"
  | "authentication-error" | "subscription-expired" | "rate-limited"
  | "transport-error" | "response-body-error" | "coverage-error" | "schema-error"
  | "response-too-large" | "quota-denied" | "shared-work-pending"
  | "deadline-exceeded" | "request-budget-exhausted" | "pagination-incomplete";
export type ApiFootballFailure = Readonly<{
  reason: ApiFootballErrorReason;
  retryable: boolean;
  httpStatus?: number;
  retryAfterMs?: number;
  quotaReason?: QuotaDenialReason;
  retryAt?: UtcInstant;
}>;
export type ApiFootballPageProvenance = Readonly<{
  provider: "api-football";
  endpoint: ApiFootballEndpoint;
  requestParameters: Readonly<Record<string, string>>;
  contractVersion: typeof API_FOOTBALL_CONTRACT_VERSION;
  retrievedAt: UtcInstant;
  providerUpdatedAt: UtcInstant | null;
  fromCache: boolean;
  /** Null when no valid page metadata was returned, including documented /status omissions. */
  currentPage: number | null;
  totalPages: number | null;
  quota: QuotaFeedback;
}>;
export type ApiFootballResult<Data> = Readonly<{
  status: "complete" | "partial" | "failed";
  data: readonly Data[];
  completeness: Readonly<{
    complete: boolean;
    reasons: readonly string[];
    missingIds: readonly number[];
    missingCoverage: readonly string[];
    invalidRows: number;
  }>;
  provenance: readonly ApiFootballPageProvenance[];
  requestsDispatched: number;
  error: ApiFootballFailure | null;
}>;
export type ApiFootballCachePermission = Readonly<{
  endpoint: ApiFootballEndpoint;
  purpose: "structured-evidence" | "fallback-only";
  cacheScope: string | null;
  maxAgeMs: number;
  retrievedAt: UtcInstant;
  data: readonly unknown[];
}>;

/** Batch support must be confirmed by a trusted verifier, not a reference alone. */
export type ApiFootballBatchEvidence = Readonly<{
  maximumIds: number;
  evidenceRef: string;
}>;
