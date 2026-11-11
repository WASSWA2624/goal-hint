import "server-only";

import type { MarketFamily, ProbabilityDistribution, SourceGroup } from "../../domain/markets.ts";
import type { ScoreDistribution } from "../../domain/score-distribution.ts";
import type { BaselineResult } from "../evaluation/evaluation-contract.ts";

export type IntelligenceProbabilities = Readonly<{ [Family in MarketFamily]: ProbabilityDistribution<Family> }>;
export type IntelligenceFixture = Readonly<{
  fixtureId: string; competitionId: string; homeTeamId: string; awayTeamId: string;
  kickoffAt: number; forecastAt: number; cohort?: "men" | "women" | "unspecified";
}>;
export type LocalGoalConfiguration = Readonly<{
  lookbackMs: number; halfLifeMs: number; minimumMatches: number; minimumTeamMatches: number;
  ridge: number; maximumIterations: number; tolerance: number;
}>;
export type LocalGoalInput = Readonly<{
  fixture: IntelligenceFixture; history: readonly Omit<BaselineResult, "cycleId">[]; configuration?: Partial<LocalGoalConfiguration>;
}>;
export type LocalGoalForecast = Readonly<{
  source: "local"; modelVersion: string; hash: string; fixtureId: string; forecastAt: number; cutoffAt: number;
  fixture: IntelligenceFixture; historyHash: string;
  status: "estimated" | "withheld"; probabilities: IntelligenceProbabilities | null;
  scoreDistribution: ScoreDistribution | null; expectedGoals: Readonly<{ home: number; away: number }> | null;
  historyIds: readonly string[]; configuration: LocalGoalConfiguration;
  diagnostics: Readonly<{
    matches: number; effectiveMatches: number; homeEffectiveMatches: number; awayEffectiveMatches: number;
    iterations: number; converged: boolean; uncertainty: "high" | "moderate"; tailProbability: number;
  }>;
  reasons: readonly string[];
}>;
export type ProviderIntelligenceForecast = Readonly<{
  source: "api-football"; modelVersion: string; fixtureId: string; observedAt: number;
  evidenceRef: string; probabilities: Partial<Pick<IntelligenceProbabilities, SourceGroup>>;
}>;
export type ContextualAssessment = Readonly<{
  source: "ai-context"; modelVersion: string; assessedAt: number; fixtureId: string; evidenceHash: string;
  facts: readonly Readonly<{
    id: string; status: "verified" | "credible-report" | "rumour" | "unknown";
    observedAt: number; availableAt: number; evidenceRef: string | null;
    impact: "critical" | "significant" | "minor"; explanation: string;
    sourceIds: readonly string[]; claimIds: readonly string[];
  }>[];
}>;
/** Every row must be an archived forecast made without its result. Authenticity
 * is verified separately by the caller; these fields alone are not proof. */
export type OutOfSampleForecast = Readonly<{
  fixtureId: string; competitionId: string; family: SourceGroup; kickoffAt: number;
  forecastAt: number; trainingEndsAt: number; resultAvailableAt: number; evidenceRef: string;
  localModelVersion: string; providerModelVersion: string;
  cohort?: "men" | "women" | "unspecified";
  local: Readonly<Record<string, number>>; provider: Readonly<Record<string, number>>; outcome: string;
}>;
export type EnsembleArtifact = Readonly<{
  version: "pit-ensemble-v1"; hash: string; learnedAt: number; competitionId: string;
  localModelVersion: string; providerModelVersion: string; minimumSamples: number; cohort: "men" | "women" | "unspecified";
  families: Readonly<Record<SourceGroup, Readonly<{
    samples: number; leagueSamples: number; localWeight: number; temperature: number;
    trainingSamples: number; calibrationSamples: number; holdoutSamples: number;
    status: "insufficient" | "estimated"; evidenceRefs: readonly string[];
  }>>>;
}>;
export type ValidatedIntelligenceForecast = Readonly<{
  version: "shadow-validator-v1"; hash: string; fixtureId: string; forecastAt: number;
  mode: "shadow"; publish: false; decision: "eligible-shadow" | "withhold";
  probabilities: IntelligenceProbabilities | null; calibratedProbability: null;
  evidenceReliability: "limited" | "supported"; modelUncertainty: "high" | "moderate";
  oddsValue: Readonly<{ probability: number; impliedProbability: number; expectedUnitReturn: number }> | null;
  components: Readonly<{ local: LocalGoalForecast; provider: ProviderIntelligenceForecast | null; context: ContextualAssessment | null }>;
  ensemble: EnsembleArtifact | null; reasons: readonly string[];
  /** Private renewal scheduling only; never publication or calibration authority. */
  eligibility?: Readonly<{ localValidUntil: number; maximumAgeMs: number;
    componentValidUntil?: Readonly<{ provider: number | null; context: number | null; quote: number | null }>;
    quoteObservedAt?: number | null;
  }>;
}>;
