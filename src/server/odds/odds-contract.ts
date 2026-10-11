import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { DE_MARGIN_METHOD } from "../../domain/odds.ts";
import type { ODDS_MAPPING_VERSION } from "../../domain/odds-markets.ts";
import type { ApiFootballBounds, ApiFootballPageProvenance, ApiFootballResult, ODDS_CONTRACT_VERSION } from "../football/api-football-contract.ts";
import type { NormalizedFixtureOdds, NormalizedOddsCatalogEntry } from "../football/api-football-normalize.ts";

/** Owner-approved odds import policy (prompt 052). Fingerprinted into every receipt and fixture state. */
export type OddsPolicy = Readonly<{
  version: 1;
  /** Owner-approved policy reference (bookmaker, de-margin, freshness and retention decisions). */
  evidenceRef: string;
  /** Private-use reference that must cover structured odds history. */
  retentionEvidenceRef: string;
  basis: "bookmaker";
  bookmakerId: number;
  method: typeof DE_MARGIN_METHOD;
  mappingVersion: typeof ODDS_MAPPING_VERSION;
  contractVersion: typeof ODDS_CONTRACT_VERSION;
  /** A price is valid only when reconfirmed within this age of kickoff (or of now, before kickoff). */
  freshnessMs: number;
  /** Snapshot retention: kickoff plus this many milliseconds. No purge job exists. */
  retainAfterKickoffMs: number;
  /** EAT dates swept per slot, starting today. */
  horizonDays: number;
  /** Slot length; one import per date per slot. */
  sweepMs: number;
}>;
export type OddsImportKind = "prices" | "bets" | "bookmakers";
export type OddsImportRequest = Readonly<{
  /** Durable job id (64 hex) or another caller-unique 64-hex identity. */
  id: string;
  kind: OddsImportKind;
  slot: UtcInstant;
  /** EAT reporting date for price sweeps; null for catalogs. */
  date: string | null;
  policy: OddsPolicy;
}>;
export type OddsRetentionPermission = Readonly<{
  evidenceRef: string;
  purpose: "structured-odds-history";
  rawPayloadsStored: false;
}>;
/** Trusted bindings. Each hook must return exactly true; anything else refuses. */
export type OddsAuthority = Readonly<{
  authorize(request: OddsImportRequest): void;
  verifyPolicy(policy: OddsPolicy): boolean;
  verifyRetention(permission: OddsRetentionPermission): boolean;
  verifyObservation(request: OddsImportRequest, result: ApiFootballResult<unknown>): boolean;
  /** Owner-recorded odds display rights ('football-odds-rights'). False keeps every price private. */
  verifyPublicDisplay(): boolean;
}>;
export type OddsErrorReason =
  | "invalid-request" | "operation-not-authorized" | "retention-not-authorized" | "unverified-policy"
  | "unverified-observation" | "invalid-result" | "conflicting-request" | "invalid-state" | "unavailable";
export class OddsError extends Error {
  readonly reason: OddsErrorReason;
  constructor(reason: OddsErrorReason) {
    super("Odds operation refused or unavailable; private diagnostics are withheld.");
    this.name = "OddsError"; this.reason = reason;
  }
}
export function oddsFail(reason: OddsErrorReason): never { throw new OddsError(reason); }

/** Retained page provenance: quota feedback belongs to the limiter, never to odds retention. */
export type OddsProvenance = Omit<ApiFootballPageProvenance, "quota">;
export type OddsBatchStatus = "complete" | "partial" | "failed";
export type ValidatedOddsObservation = Readonly<{
  request: OddsImportRequest;
  policyHash: string;
  scopeKey: string;
  status: OddsBatchStatus;
  reasons: readonly string[];
  requestsDispatched: number;
  /** Latest retrieval among accepted pages, or the validation time when nothing was retrieved. */
  receivedAt: UtcInstant;
  provenance: readonly OddsProvenance[];
  rows: readonly NormalizedFixtureOdds[];
  catalog: readonly Pick<NormalizedOddsCatalogEntry, "id" | "name">[];
  missingCoverage: readonly string[];
}>;
/** Per-fixture receipt outcome decided before any price is applied. */
export type OddsFixtureOutcome = "apply" | "unknown-fixture" | "after-kickoff" | "kickoff-mismatch" | "not-scheduled";
export type OddsBatchBody = Readonly<{
  id: string;
  accountId: string;
  kind: OddsImportKind;
  scopeKey: string;
  policyHash: string;
  status: OddsBatchStatus;
  requestsDispatched: number;
  receivedAt: UtcInstant;
  requestId: string;
  slot: UtcInstant;
  date: string | null;
  contractVersion: typeof ODDS_CONTRACT_VERSION;
  reasons: readonly string[];
  missingCoverage: readonly string[];
  pages: readonly OddsProvenance[];
  /** Outcomes and a content hash per provider fixture; prices are never retained here. */
  fixtures: readonly Readonly<{ externalId: number; outcome: OddsFixtureOutcome; observationHash: string }>[];
  /** /odds/bets or /odds/bookmakers catalog names (not prices). */
  catalog: readonly Readonly<{ id: number; name: string }>[];
}>;
export type OddsApplyResult = "changed" | "unchanged" | "skipped";
export type OddsImportSummary = Readonly<{
  batchId: string;
  status: OddsBatchStatus;
  requestsDispatched: number;
  outcomes: Readonly<Record<OddsFixtureOutcome | "changed" | "unchanged" | "skipped" | "withdrawn", number>>;
  /** The adapter's static failure reason, never provider diagnostics. */
  error: Readonly<{ reason: string; retryable: boolean }> | null;
}>;
export type OddsBoundsFactory = (request: OddsImportRequest) => ApiFootballBounds;
