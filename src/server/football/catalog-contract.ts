import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { FixtureQuery, TeamQuery, CompetitionQuery } from "./api-football-adapter.ts";
import type { ApiFootballBounds, ApiFootballResult, ApiFootballFailure, ApiFootballPageProvenance } from "./api-football-contract.ts";
import type { NormalizedFixture, NormalizedTeam, NormalizedCompetition, RegulationScoreCandidate } from "./api-football-normalize.ts";

export type CatalogSelection =
  | Readonly<{ kind: "fixtures"; query: FixtureQuery }>
  | Readonly<{ kind: "teams"; query: TeamQuery }>
  | Readonly<{ kind: "competitions"; query: CompetitionQuery }>;
export type CatalogImportRequest = Readonly<{
  id: string;
  selection: CatalogSelection;
  bounds: ApiFootballBounds;
  retentionEvidenceRef: string;
  knownSubset?: Readonly<{ fixtureIds: readonly number[]; evidenceRef: string }>;
}>;
export type CatalogTeamMapping = Readonly<{
  externalId: number;
  candidateExternalId: number;
  evidenceRef: string | null;
  sourceRef: string;
  observedAt: UtcInstant;
}>;
export type CatalogProviderRow = NormalizedFixture | NormalizedTeam | NormalizedCompetition;
export type CatalogAuthority = Readonly<{
  authorize(request: CatalogImportRequest): void;
  verifyRetention(permission: Readonly<{
    selection: CatalogSelection;
    evidenceRef: string;
    purpose: "structured-catalog-and-audit-history";
    rawPayloadsStored: false;
  }>): boolean;
  verifyObservation(request: CatalogImportRequest, result: ApiFootballResult<CatalogProviderRow>): boolean;
  verifyLogo(url: string): boolean;
  verifyRegulationScore(candidate: RegulationScoreCandidate): boolean;
  regulationEvidenceRef?(candidate: RegulationScoreCandidate): string | null;
  authorizeMapping(mapping: CatalogTeamMapping): void;
  verifyMapping(mapping: CatalogTeamMapping): boolean;
  verifyKnownSubset?(permission: Readonly<{
    selection: CatalogSelection;
    fixtureIds: readonly number[];
    evidenceRef: string;
  }>): boolean;
}>;
/** Quota feedback is owned by the limiter, not copied into catalog retention. */
export type CatalogProvenance = Omit<ApiFootballPageProvenance, "quota">;
export type CatalogPreparedBatch = Readonly<{
  request: CatalogImportRequest;
  selection: CatalogSelection;
  rows: Readonly<{
    fixtures: readonly NormalizedFixture[];
    teams: readonly NormalizedTeam[];
    competitions: readonly NormalizedCompetition[];
  }>;
  scoreEvidenceRefs: Readonly<Record<string, string>>;
  /** Original provider retrieval time; receipt time only when no source was observed. */
  observedAt: UtcInstant;
  latestRetrievedAt: UtcInstant | null;
  scopeKey: string;
  requestFingerprint: string;
  fingerprint: string;
  status: "complete" | "partial" | "failed" | "degraded";
  reasons: readonly string[];
  missingIds: readonly number[];
  missingCoverage: readonly string[];
  invalidRows: number;
  requestsDispatched: number;
  provenance: readonly CatalogProvenance[];
  error: ApiFootballFailure | null;
  completeEmpty: boolean;
}>;
