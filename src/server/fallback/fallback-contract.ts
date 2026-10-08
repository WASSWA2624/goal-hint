import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { AcceptedMarket, MarketFamily, MarketIssue, MarketRejectionReason, MarketSnapshot, SourceGroup } from "../../domain/markets.ts";
import type { EvidenceContext } from "../evidence/evidence-contract.ts";
import type { ModelPin } from "../predictor/predictor-contract.ts";
import type { PredictorCalibrationStatus, PredictorCalibratedOutput } from "../predictor/predictor-calibration.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";

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
  "unverified-mapping" | "stale-context" | "ineligible-refresh";
export type ProviderFallbackResult = Readonly<{
  status: "candidate"; candidate: ProviderFallbackCandidate; requestsDispatched: number; requestCountUnknown: false;
}> | Readonly<{ status: "denied"; reason: ProviderFallbackReason; requestsDispatched: number; requestCountUnknown: boolean }>;
export type FallbackTrigger = "ai-failure" | "ai-timeout" | "ai-insufficient-evidence" | "ai-budget-exhausted" |
  "ai-missing-group" | "ai-invalid-group";
export type FallbackReason = Readonly<{ reason: FallbackTrigger; detail: string }>;
export type ForecastProvenance = Readonly<{
  kind: "ai"; pin: ModelPin; modelVersionId: string; evidenceHash: string; transportEvidenceRef: string;
  calibration: PredictorCalibrationStatus; evaluation: PredictorCalibratedOutput["evaluation"];
  provisional: boolean; sources: PredictorCalibratedOutput["sources"];
  evidence: PredictorCalibratedOutput["evidence"]; outputTiming: PredictorCalibratedOutput["outputTiming"];
}> | Readonly<{
  kind: "api-football"; source: ProviderFallbackProvenance; policyVersion: string; policyEvidenceRef: string;
}>;
export type ResolvedForecastMarket = Readonly<{
  available: true; market: AcceptedMarket; fallback: FallbackReason | null;
  timestamps: ForecastTimestamps; provenance: ForecastProvenance; flags: readonly ForecastFlag[];
}> | Readonly<{ available: false; reason: MarketRejectionReason | ProviderFallbackReason | "invalid-timing" }>;
export type ForecastExplanation = Readonly<{ text: string; sourceUrls: readonly string[] }>;
export type ResolvedForecastCandidate = Readonly<{
  context: FallbackContext; markets: Readonly<Record<MarketFamily, ResolvedForecastMarket>>;
  issues: readonly MarketIssue[]; reasons: readonly ForecastExplanation[]; uncertainty: ForecastExplanation;
  audit: Readonly<{ aiStatus: PredictorResult["status"]; aiReason: string | null;
    providerStatus: ProviderFallbackResult["status"] | "not-requested"; providerReason: ProviderFallbackReason | null }>;
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
