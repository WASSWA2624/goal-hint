import "server-only";

import { z } from "zod";
import { validateMarketSnapshot, type MarketSnapshot, type MarketSource } from "../../domain/markets.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import { fourDigitYearInstant as instant } from "../shared/utc-instant.ts";
import type { ForecastSourceOrder, ForecastTimestamps, ProviderFallbackResult, ResolvedForecastCandidate } from "./fallback-contract.ts";
import { FallbackInputError, fallbackAiReasons, fallbackProviderReasons, forecastSourceOrders, parseFallbackMarketSnapshot } from "./fallback-input.ts";

/** One source's contemporaneous forecast for a refresh, whether or not it was published. Probabilities are the
 * source's own validated groups; an unavailable receipt has every family explicitly unavailable, never filled. */
export type ForecastSourceReceipt = Readonly<{
  source: MarketSource; status: "candidate" | "unavailable"; reason: string | null;
  markets: MarketSnapshot; timestamps: ForecastTimestamps | null; version: string | null; modelVersionId: string | null;
  evidence: Readonly<{ conflicting: boolean; limitedNews: boolean }> | null;
}>;
/** Both sources from the same refresh, fixture, evidence cutoff and fallback stage clock. */
export type ForecastSourceReceipts = Readonly<{
  version: 1; order: ForecastSourceOrder; ai: ForecastSourceReceipt; "api-football": ForecastSourceReceipt;
}>;

const unavailable = (source: MarketSource, reason: string): ForecastSourceReceipt => freezeEvidence({ source, status: "unavailable", reason,
  markets: validateMarketSnapshot({}), timestamps: null, version: null, modelVersionId: null, evidence: null });

/** Pure. The final resolution audit decides each status, after the resolver's identity, authority and staleness
 * downgrades, so a receipt never presents a source the resolution refused. */
export function forecastSourceReceipts(value: Readonly<{
  ai: PredictorResult; provider: ProviderFallbackResult | null; audit: ResolvedForecastCandidate["audit"]; order: ForecastSourceOrder;
}>): ForecastSourceReceipts {
  const { ai, provider, audit, order } = value;
  const aiReceipt = ai.status === "candidate" && audit.aiStatus === "candidate" && audit.aiReason === null
    ? freezeEvidence({ source: "ai" as const, status: "candidate" as const, reason: null, markets: ai.output.markets,
      timestamps: { generatedAt: ai.output.timestamps.generatedAt, retrievedAt: ai.output.timestamps.retrievedAt,
        providerUpdatedAt: ai.output.timestamps.providerUpdatedAt },
      version: ai.output.schemaVersion, modelVersionId: ai.output.modelVersionId,
      evidence: { conflicting: ai.output.evidence.missingness.some((item) => item.reason === "conflicting"),
        limitedNews: ai.output.evidence.coverage.limitedNews } })
    : unavailable("ai", audit.aiReason ?? (ai.status === "denied" ? ai.reason : "invalid-timing"));
  const providerReceipt = provider?.status === "candidate" && audit.providerStatus === "candidate"
    ? freezeEvidence({ source: "api-football" as const, status: "candidate" as const, reason: null, markets: provider.candidate.markets,
      timestamps: provider.candidate.timestamps, version: provider.candidate.provenance.contractVersion, modelVersionId: null, evidence: null })
    : unavailable("api-football", audit.providerReason ?? "not-requested");
  return freezeEvidence({ version: 1, order, ai: aiReceipt, "api-football": providerReceipt });
}

const text = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value));
const timestamps = z.strictObject({ generatedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable() })
  .refine((value) => (value.generatedAt === null || value.generatedAt <= value.retrievedAt) &&
    (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt));
const receipt = (source: MarketSource, reasons: readonly [string, ...string[]]) => z.strictObject({
  source: z.literal(source), status: z.enum(["candidate", "unavailable"]), reason: z.enum(reasons).nullable(), markets: z.unknown(),
  timestamps: timestamps.nullable(), version: text.nullable(), modelVersionId: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  evidence: z.strictObject({ conflicting: z.boolean(), limitedNews: z.boolean() }).nullable() });
const receipts = z.strictObject({ version: z.literal(1), order: z.enum(forecastSourceOrders),
  ai: receipt("ai", fallbackAiReasons), "api-football": receipt("api-football", [...fallbackProviderReasons, "not-requested"]) });

/** Archive validation of a sealed fallback stage's receipts: single-source snapshots, and status, reason and detail
 * that agree. It does not re-prove provider rights or model ownership. */
export function parseForecastSourceReceipts(value: unknown): ForecastSourceReceipts {
  try {
    const parsed = receipts.parse(value);
    for (const source of ["ai", "api-football"] as const) {
      const item = parsed[source], markets = parseFallbackMarketSnapshot(item.markets, source);
      const anyAvailable = Object.values(markets.markets).some((market) => market.available);
      if (item.status === "candidate" ? item.reason !== null || item.timestamps === null || item.version === null ||
          (source === "ai") !== (item.modelVersionId !== null && item.evidence !== null) ||
          source === "api-football" && (item.modelVersionId !== null || item.evidence !== null)
        : item.reason === null || anyAvailable || item.timestamps !== null || item.version !== null || item.modelVersionId !== null ||
          item.evidence !== null) throw new Error();
    }
    return value as ForecastSourceReceipts;
  } catch { throw new FallbackInputError(); }
}
