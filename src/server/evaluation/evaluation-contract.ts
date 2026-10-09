import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { AcceptedMarket, MarketFamily, MarketSnapshot } from "../../domain/markets.ts";
import type { SettlementContext } from "../../domain/market-settlement.ts";
import type { EvidenceContext } from "../evidence/evidence-contract.ts";
import type { ModelVersion, ModelWindow } from "../predictor/predictor-contract.ts";

export const EVALUATION_VERSION = "chronological-evaluation-v1";
export const evaluationSystems = ["ai", "api-football", "combined", "league-frequency", "team-strength"] as const;
export type EvaluationSystem = typeof evaluationSystems[number];
export type EvaluationSplit = "training" | "validation" | "calibration" | "finalTest";
export type HorizonBand = Readonly<{ id: string; minimumMs: number; maximumMs: number }>;
export type BaselineConfiguration = Readonly<{
  version: string; lookbackMs: number; minimumMatches: number;
  leagueFrequency: Readonly<{ alpha: number }>;
  teamStrength: Readonly<{ initialRating: number; kFactor: number; scale: number; homeAdvantage: number; drawWeight: number }>;
}>;
export type QualityGate = Readonly<{
  id: string; purpose: "candidate" | "public-claim"; system: EvaluationSystem; family: MarketFamily; horizonId: string;
  minimumSamples: number; minimumCoverage: number; maximumBrier: number | null; maximumLogLoss: number | null;
  maximumCalibrationError: number | null; baseline: "league-frequency" | "team-strength" | null;
  maximumBrierDifference: number | null;
}>;
export type EvaluationProtocolConfiguration = Readonly<{
  version: typeof EVALUATION_VERSION; name: string; ruleVersion: "regulation-markets-v1";
  frozenAt: UtcInstant | null; approvalRef: string | null; selectionVersion: string;
  windows: Readonly<Record<EvaluationSplit, ModelWindow | null>>;
  competitionIds: readonly string[]; horizons: readonly HorizonBand[];
  candidateModel: ModelVersion | null; previousApprovedModel: ModelVersion | null; providerContractVersion: string | null;
  calibrationBands: readonly number[]; confidenceZ: number; baselines: BaselineConfiguration;
  gates: readonly QualityGate[] | null;
}>;
export type EvaluationProtocol = EvaluationProtocolConfiguration & Readonly<{ id: string; hash: string }>;
export type AvailabilityProof = Readonly<{
  id: string; version: string; kind: "football" | "news" | "provider-forecast";
  availableAt: UtcInstant; retrievedAt: UtcInstant; publishedAt: UtcInstant | null; providerUpdatedAt: UtcInstant | null;
  evidenceRef: string;
}>;
export type EvaluationForecast = Readonly<{
  version: string; modelVersionId: string | null; calibrationVersion: string | null;
  receiptHash: string; evidenceRef: string; capture: "historical-snapshot" | "prospective";
  capturedAt: UtcInstant; generatedAt: UtcInstant | null; providerUpdatedAt: UtcInstant | null;
  evidence: readonly AvailabilityProof[]; markets: MarketSnapshot;
}>;
export type BaselineResult = Readonly<{
  fixtureId: string; cycleId: string; competitionId: string; homeTeamId: string; awayTeamId: string;
  kickoffAt: UtcInstant; availableAt: UtcInstant; homeGoals: number; awayGoals: number;
  period: "regulation-including-stoppage-time"; observationHash: string; evidenceRef: string;
}>;
export type EvaluationFixture = Readonly<{
  context: EvidenceContext; competitionId: string; forecastAt: UtcInstant; manifestAt: UtcInstant;
  result: Readonly<{ context: SettlementContext; availableAt: UtcInstant | null; observationHash: string; evidenceRef: string }>;
  forecasts: Readonly<Record<"ai" | "api-football" | "combined", EvaluationForecast | null>>;
  unavailableReasons: Readonly<Record<"ai" | "api-football" | "combined", string | null>>;
}>;
export type EvaluationDatasetConfiguration = Readonly<{
  version: 1; selectionVersion: string; evidenceRef: string; mode: "historical" | "prospective" | "synthetic";
  fixtures: readonly EvaluationFixture[]; history: readonly BaselineResult[];
}>;
export type EvaluationDataset = EvaluationDatasetConfiguration & Readonly<{ id: string; hash: string }>;
export type MetricObservation = Readonly<{ market: AcceptedMarket; result: SettlementContext }>;
export type CalibrationBin = Readonly<{
  selection: string; lower: number; upper: number; count: number; meanProbability: number | null;
  observedFrequency: number | null; interval: Readonly<{ lower: number; upper: number }> | null;
}>;
export type EvaluationMetrics = Readonly<{
  count: number; correct: number; incorrect: number; hitRate: number | null;
  brier: number | null; logLoss: number | null; calibrationError: number | null;
  calibration: readonly CalibrationBin[];
}>;
export type BaselineForecast = Readonly<{ markets: MarketSnapshot; historyIds: readonly string[]; version: string; limitations: readonly string[] }>;
export type EvaluationAuthority = Readonly<{
  authorize(protocol: EvaluationProtocol, dataset: EvaluationDataset): void;
  verifyProtocol(protocol: EvaluationProtocol): boolean;
  verifyDataset(dataset: EvaluationDataset): boolean;
  verifyForecast(forecast: EvaluationForecast, fixture: EvaluationFixture, system: "ai" | "api-football" | "combined"): boolean;
  verifyEvidence(proof: AvailabilityProof, fixture: EvaluationFixture): boolean;
  verifyResult(fixture: EvaluationFixture): boolean;
  verifyHistory(result: BaselineResult): boolean;
  verifyModel(model: ModelVersion): boolean;
  verifyUntouchedFinalTest(protocol: EvaluationProtocol, dataset: EvaluationDataset): boolean;
}>;
export type EvaluationCoverage = Readonly<{
  total: number; available: number; unavailable: number; void: number; pending: number; settled: number;
  sources: Readonly<{ ai: number; "api-football": number }>;
}>;
export type EvaluationCell = Readonly<{
  system: EvaluationSystem; family: MarketFamily; horizonId: string; versions: readonly string[];
  coverage: EvaluationCoverage; metrics: EvaluationMetrics;
  sourceMetrics: Readonly<{ ai: EvaluationMetrics; "api-football": EvaluationMetrics }> | null;
}>;
export type MatchedComparison = Readonly<{
  system: "ai" | "api-football" | "combined"; referenceSystem: EvaluationSystem; kind: "baseline" | "source-comparison";
  family: MarketFamily; horizonId: string; count: number; fixtureKeysHash: string;
  candidate: EvaluationMetrics; reference: EvaluationMetrics; brierDifference: number | null;
}>;
export type EvaluationGateResult = Readonly<{
  id: string; purpose: QualityGate["purpose"]; status: "passed" | "failed" | "pending";
  diagnostic: "passed" | "failed" | "pending"; reasons: readonly string[]; criteria: QualityGate;
}>;
export type EvaluationReport = Readonly<{
  version: typeof EVALUATION_VERSION; id: string; hash: string; protocolId: string; datasetId: string;
  mode: EvaluationDataset["mode"]; split: Exclude<EvaluationSplit, "training">; ruleVersion: "regulation-markets-v1";
  window: ModelWindow | null; fixtureDatePeriod: Readonly<{ first: string | null; last: string | null }>;
  candidateModelId: string | null; previousApprovedModelId: string | null;
  calibrationVersion: string | null; providerContractVersion: string | null;
  selectedRows: number; excludedRows: readonly Readonly<{ key: string; reason: string }>[];
  cells: readonly EvaluationCell[]; comparisons: readonly MatchedComparison[]; gates: readonly EvaluationGateResult[];
  decision: "retain-previous-approved" | "remain-provisional" | "eligible-for-independent-review";
  publicClaimStatus: "pending" | "blocked" | "eligible-for-independent-review";
  limitations: readonly string[]; prospectiveRequirements: readonly string[];
  promotionPerformed: false; publicClaimAuthorized: false;
}>;
