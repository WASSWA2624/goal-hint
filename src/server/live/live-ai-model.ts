import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { RuntimePolicy } from "../config/runtime-policy.ts";
import type { CostRateCard } from "../cost-control/cost-contract.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ForecastSourceOrder } from "../fallback/fallback-contract.ts";
import type { ModelVersion } from "../predictor/predictor-contract.ts";
import { createModelVersion } from "../predictor/predictor-input.ts";

export const LIVE_AI_MODEL = "gpt-6.1-sol";
export const LIVE_AI_CONTRACT = "openai-responses-v1";
export const LIVE_AI_RATE_REVIEW = "2026-10-13";
export const LIVE_AI_MODEL_REFERENCE = "https://developers.openai.com/api/docs/models/gpt-6.1-sol";

/** Changing provider, model, grounding, timing or calibration creates a new immutable model identity. */
export function liveAiModel(policy: RuntimePolicy): ModelVersion {
  const { provider, model, calibrationRef } = policy.choices.ai;
  if (provider !== "openai" || model !== LIVE_AI_MODEL || calibrationRef === null)
    throw new Error("The live AI provider/model or calibration configuration is not reviewed.");
  return createModelVersion({
    version: 1, provider, model, providerModelVersion: model, contractVersion: LIVE_AI_CONTRACT,
    contractEvidenceRef: LIVE_AI_MODEL_REFERENCE,
    promptVersion: "regulation-ai-prompt-v1", schemaVersion: "regulation-ai-output-v1",
    windows: { training: null, validation: null, calibration: null, finalTest: null },
    calibration: { kind: "none", version: "live-football-no-calibration-v1", evidenceRef: calibrationRef },
    evaluation: { version: "live-football-provisional-v1", evidenceRef: calibrationRef, status: "provisional", evaluationRef: null },
    // Responses reports creation, not an independently verified generation-completion clock.
    outputTiming: { maxAgeMs: 6 * 60 * 60_000, basis: "retrieved", unknownGeneration: "allow-flagged", unknownUpdate: "allow-flagged" },
    bounds: { maxInputBytes: 64_000, maxOutputBytes: 32_000, maxSources: 64, maxFacts: 128,
      maxReasonCharacters: 500, maxUncertaintyCharacters: 500, maxCitationsPerItem: 4, maxCitationCharacters: 512 },
  });
}

const PROMOTION_REFERENCE = /^forecast-evaluation:[a-f0-9]{64}:([a-f0-9]{64})$/u;
/** Parses the configured source order and model-bound reference; this does not authorize promotion.
 * Live readiness additionally requires the actual independently verified frozen evidence binding, which is not mounted. */
export function liveSourceOrder(policy: RuntimePolicy, model: ModelVersion): ForecastSourceOrder {
  const { sourceOrder, aiPromotionRef } = policy.choices.forecasts;
  if (sourceOrder !== "ai-first") return "provider-first";
  if (aiPromotionRef?.match(PROMOTION_REFERENCE)?.[1] !== model.id) throw new Error("AI-first publication needs a promotion reference for the current model.");
  return "ai-first";
}

/** UTC months are ledger partitions; they impose no monthly spending cap in usage-based mode. */
export function liveAiAccountingWindow(at: UtcInstant) {
  const date = new Date(at), year = date.getUTCFullYear(), month = date.getUTCMonth();
  const startsAt = utcInstantFromEpochMilliseconds(Date.UTC(year, month, 1));
  const endsAt = utcInstantFromEpochMilliseconds(Date.UTC(year, month + 1, 1));
  return Object.freeze({ startsAt, endsAt, name: `${year}-${String(month + 1).padStart(2, "0")}` });
}

/** Reviewed Standard-tier, short-context rates. Discounts are measured from the receipt separately. */
export function liveAiRate(model: ModelVersion, at: UtcInstant): CostRateCard {
  if (model.provider !== "openai" || model.model !== LIVE_AI_MODEL || model.contractVersion !== LIVE_AI_CONTRACT)
    throw new Error("The requested AI model has no reviewed price card.");
  const window = liveAiAccountingWindow(at);
  return Object.freeze({ category: "ai", provider: model.provider, model: model.model,
    version: `openai-gpt-6.1-sol-standard-${LIVE_AI_RATE_REVIEW}-${window.name}`,
    currency: "USD", startsAt: window.startsAt, endsAt: window.endsAt,
    usdConversion: { numerator: "1", denominator: "1", evidenceRef: "openai-usd-standard-pricing" },
    rounding: "ceil-per-component", billingRule: "measured-usage",
    rates: { requests: { amount: "0", perUnits: 1 }, inputTokens: { amount: "2", perUnits: 1_000_000 },
      outputTokens: { amount: "10", perUnits: 1_000_000 }, billedUnits: { amount: "0.5", perUnits: 1_000_000 } },
    evidenceRef: LIVE_AI_MODEL_REFERENCE,
  });
}

export function liveAiAccountId(policy: RuntimePolicy): string {
  if (policy.choices.budgets.approvalRef === null) throw new Error("AI accounting approval is required.");
  // A credential rotation must not reset the ledger; the owner approval identifies this app account.
  return evidenceFingerprint({ version: 1, provider: "openai", account: policy.choices.budgets.approvalRef });
}
