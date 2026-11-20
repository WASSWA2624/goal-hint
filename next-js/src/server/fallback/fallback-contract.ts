import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { AcceptedMarket, MarketFamily, MarketIssue, MarketRejectionReason, MarketSnapshot, MarketSource, SourceGroup } from "../../domain/markets.ts";
import type { EvidenceContext } from "../evidence/evidence-contract.ts";
import type { ModelPin } from "../predictor/predictor-contract.ts";
import type { PredictorCalibrationStatus, PredictorCalibratedOutput } from "../predictor/predictor-calibration.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import type { RecommendationDecision } from "../../domain/recommendation.ts";
import type { LocalPoissonRates } from "../../domain/score-distribution-markets.ts";

/** Identity for one eligible refresh; it never supplies an old published snapshot. */
export type FallbackContext = Readonly<{ context: EvidenceContext; jobId: string; pin: ModelPin | null; evidenceHash: string }>;
export type ForecastTimestamps = Readonly<{
  generatedAt: UtcInstant | null; retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null;
}>;
export type ForecastFlag = "unknown-generation-time" | "unknown-provider-update-time";
export type ProviderFallbackProvenance = Readonly<{
  provider: "api-football"; endpoint: "predictions"; externalFixtureId: number; jobId: string;
  contractVersion: string; observationHash: string; sourceUrl: string | null; sourceEvidenceRef: string;
  supportEvidenceRefs: Readonly<Partial<Record<SourceGroup, string>>>; fromCache: boolean;
}>;
export type ProviderFallbackCandidate = Readonly<{
  context: EvidenceContext; policyVersion: string; policyEvidenceRef: string; markets: MarketSnapshot;
  timestamps: ForecastTimestamps; provenance: ProviderFallbackProvenance; flags: readonly ForecastFlag[];
}>;
export type ProviderFallbackReason = "invalid-request" | "not-authorized" | "unconfigured" | "invalid-response" |
  "wrong-identity" | "unsupported-markets" | "stale" | "unknown-source-time" | "future-source-time" |
  "timeout" | "quota-denied" | "request-budget-exhausted" | "provider-unavailable" | "clock-regression" |
  "unverified-mapping" | "stale-context" | "ineligible-refresh" | "disabled";
export type ProviderFallbackResult = Readonly<{
  status: "candidate"; candidate: ProviderFallbackCandidate; requestsDispatched: number; requestCountUnknown: false;
}> | Readonly<{ status: "denied"; reason: ProviderFallbackReason; requestsDispatched: number; requestCountUnknown: boolean }>;
/** Why API-Football supplied a published group. "provider-first": the reviewed source order prefers the provider
 * baseline; the AI receipt is recorded separately. AI groups never carry a fallback reason (a database check). */
export type FallbackTrigger = "ai-failure" | "ai-timeout" | "ai-insufficient-evidence" | "ai-budget-exhausted" |
  "ai-missing-group" | "ai-invalid-group" | "provider-first" | "provider-baseline" | "local-unavailable";
/** Frozen per AI refresh intent. Absent means the original AI-first resolution without contemporaneous capture. */
export type ForecastSourceOrder = "provider-first" | "ai-first";
export const LIVE_FORECAST_CASCADE = "ai-local-provider";
export const QUALIFIED_FORECAST_CASCADE = "qualified-ai-local-provider-v1";
export const LOCAL_FIRST_FORECAST_CASCADE = "qualified-local-provider-v1";
export const forecastCascades = [LIVE_FORECAST_CASCADE, QUALIFIED_FORECAST_CASCADE, LOCAL_FIRST_FORECAST_CASCADE] as const;
export type ForecastCascade = typeof forecastCascades[number];
export type ForecastQualification = Readonly<{
  verifyAiNumericalBasis?(candidate: Extract<PredictorResult, { status: "candidate" }>, context: FallbackContext, family: SourceGroup): boolean;
  verifyLocalNumericalBasis?(candidate: ResolvedForecastCandidate, context: FallbackContext, family: SourceGroup): boolean;
}>;
export type ForecastEngineTransition = Readonly<{ selected: MarketSource | null; ai: string; local: string; provider: string }>;
export const localForecastAbstentions = ["insufficient-local-evidence", "unqualified-local-model", "local-evaluation-unavailable"] as const;
export type LocalForecastAbstention = typeof localForecastAbstentions[number];
/** Versioned runtime source policy; legacy baseline remains readable for historical jobs. */
export type ForecastSelectionPolicy = "legacy-ai-primary" | "provider-baseline" | "optional-ai-primary";
export type FallbackReason = Readonly<{ reason: FallbackTrigger; detail: string }>;
export type ForecastProvenance = Readonly<{
  kind: "ai"; pin: ModelPin; modelVersionId: string; evidenceHash: string; transportEvidenceRef: string;
  calibration: PredictorCalibrationStatus; evaluation: PredictorCalibratedOutput["evaluation"];
  provisional: boolean; sources: PredictorCalibratedOutput["sources"];
  evidence: PredictorCalibratedOutput["evidence"]; outputTiming: PredictorCalibratedOutput["outputTiming"];
    numericalBasis?: "qualified-joint-score-distribution";
}> | Readonly<{
  kind: "api-football"; source: ProviderFallbackProvenance; policyVersion: string; policyEvidenceRef: string;
}> | Readonly<{
  kind: "local-engine"; modelVersion: string; historyHash: string; evidenceHash: string;
  rates: LocalPoissonRates;
  sample: Readonly<{ matches: number; homeEffectiveMatches: number; awayEffectiveMatches: number }>;
    numericalBasis?: "qualified-local-model";
}>;
export type ResolvedForecastMarket = Readonly<{
  available: true; market: AcceptedMarket; fallback: FallbackReason | null;
  timestamps: ForecastTimestamps; provenance: ForecastProvenance; flags: readonly ForecastFlag[];
}> | Readonly<{ available: false; reason: MarketRejectionReason | ProviderFallbackReason | LocalForecastAbstention | "invalid-timing" }>;
export type ForecastExplanation = Readonly<{ text: string; sourceUrls: readonly string[] }>;
export type ResolvedForecastCandidate = Readonly<{
  context: FallbackContext; markets: Readonly<Record<MarketFamily, ResolvedForecastMarket>>;
  issues: readonly MarketIssue[]; reasons: readonly ForecastExplanation[]; uncertainty: ForecastExplanation;
  audit: Readonly<{ aiStatus: PredictorResult["status"]; aiReason: string | null;
    providerStatus: ProviderFallbackResult["status"] | "not-requested"; providerReason: ProviderFallbackReason | null;
    /** Present only when the refresh plan froze a source order. */
    sourceOrder?: ForecastSourceOrder;
    sourceCascade?: ForecastCascade;
    transitions?: Readonly<Record<MarketFamily, ForecastEngineTransition>>;
    localStatus?: "candidate" | "unavailable" | "not-requested";
    /** Sealed rates for goal markets when the AI supplied some or all of the legacy groups. */
    localGoalRates?: LocalPoissonRates;
    /** Immutable decision and private quote provenance, sealed in candidateJson with the revision. */
    recommendation?: RecommendationDecision }>;
}>;
export type FallbackResolutionReason = "invalid-request" | "not-authorized" | "ineligible-refresh";
export type FallbackResolutionResult = Readonly<{ status: "candidate"; candidate: ResolvedForecastCandidate }> |
  Readonly<{ status: "retain-previous-or-unavailable"; candidate: ResolvedForecastCandidate }> |
  Readonly<{ status: "denied"; reason: FallbackResolutionReason }>;
export type FallbackResolutionAuthority = Readonly<{
  authorize(context: FallbackContext): void;
  verifyContext(context: FallbackContext): boolean;
  /** Proves the owning invocation/output or denial; a forged failure cannot request fallback. */
  verifyAi(result: PredictorResult, context: FallbackContext, now: UtcInstant): boolean;
  /** Must prove the actual response, support policy, current freshness and rights. */
  verifyProvider(candidate: ProviderFallbackCandidate, context: FallbackContext, now: UtcInstant): boolean;
}>;
