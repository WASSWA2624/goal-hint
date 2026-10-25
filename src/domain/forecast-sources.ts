import type { MarketFamily, MarketSource } from "./markets.ts";
import type { SettlementOutcomeStatus } from "./market-settlement.ts";

/** The private AI against API-Football comparison the owner page renders; built on the server from sealed receipts. */
export type ForecastSourceMetrics = Readonly<{
  count: number; correct: number; incorrect: number; hitRate: number | null; brier: number | null; logLoss: number | null; calibrationError: number | null;
}>;
type Interval = Readonly<{ lower: number; upper: number }>;
export type ForecastSourceScores = Readonly<{
  count: number; ai: ForecastSourceMetrics; "api-football": ForecastSourceMetrics;
  /** AI minus API-Football on the same matched settled predictions; negative means AI scored better. */
  brierDifference: number | null; logLossDifference: number | null;
  hitRateIntervals: Readonly<{ ai: Interval | null; "api-football": Interval | null }>;
}>;
export type ForecastSourceCoverage = Readonly<{
  locked: number; void: number; notCaptured: number; captured: number; aiAvailable: number; providerAvailable: number;
  both: number; aiOnly: number; providerOnly: number; neither: number; pending: number; settled: number;
}>;
export type ForecastSourceFamily = Readonly<{
  family: MarketFamily; horizonId: string | null; derivedFrom: "match-result" | null;
  state: "available" | "unavailable"; reason: string | null; coverage: ForecastSourceCoverage;
  matched: ForecastSourceScores & Readonly<{ fixtureKeysHash: string }>;
  disagreements: ForecastSourceScores & Readonly<{ aiCorrect: number; providerCorrect: number }>;
  segments: Readonly<{ conflictingEvidence: ForecastSourceScores; limitedNews: ForecastSourceScores }>;
  gates: readonly Readonly<{ id: string; purpose: "candidate" | "public-claim"; diagnostic: "passed" | "failed" | "pending";
    reasons: readonly string[]; failures: readonly string[] }>[];
}>;
type PairSide = Readonly<{ selection: string; probability: number; outcome: SettlementOutcomeStatus }>;
export type ForecastSourcePair = Readonly<{
  fixtureId: string; matchLabel: string; href: string; kickoffAt: number; sourceOrder: "provider-first" | "ai-first";
  published: MarketSource | null; ai: PairSide; "api-football": PairSide;
}>;
export type ForecastSourcesReport = Readonly<{
  asOf: number; from: string; to: string; market: MarketFamily | "all"; fixtureCount: number; confidenceZ: number;
  orders: Readonly<{ "provider-first": number; "ai-first": number; none: number }>;
  comparisons: readonly ForecastSourceFamily[]; recent: readonly ForecastSourcePair[];
}>;
