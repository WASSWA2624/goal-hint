import type { MarketFamily, MarketSelection, MarketSource } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";

/** Provisional engineering policy, not a calibrated accuracy or profitability claim. */
export const recommendationPolicy = Object.freeze({
  version: "probability-qualified-odds-v1",
  minimumProbability: 0.65,
  forecastMaxAgeMs: 86_400_000,
  quoteMaxAgeMs: 10_800_000,
  marketOrder: publicPolicy.markets,
  period: publicPolicy.matchPeriod,
  totalGoalsLine: publicPolicy.totalGoalsLine,
  evidenceVersion: "baseline-evidence-v1",
  tieBreak: "decimal-odds-probability-policy-order" as const,
});
export type RecommendationPolicy = typeof recommendationPolicy;
export type RecommendationQuote = Readonly<{
  fixtureId: string; fixtureVersion: string; homeTeamId: string; awayTeamId: string;
  family: MarketFamily; selection: MarketSelection; period: typeof publicPolicy.matchPeriod; line: number | null;
  bookmakerId: number; decimal: string; snapshotId: string; observedAt: number; providerUpdatedAt: number | null;
  /** Receipt certifying the bet's availability at the frozen cutoff; snapshot clocks remain original. */
  observationReceiptId?: string;
  permitted: boolean; suspended: boolean;
}>;
export type RecommendationPick = Readonly<{
  family: MarketFamily; selection: MarketSelection; period: typeof publicPolicy.matchPeriod; line: number | null;
  source: MarketSource; probability: number;
  forecastTimestamps: Readonly<{ generatedAt: number | null; retrievedAt: number; providerUpdatedAt: number | null }>;
  quote: RecommendationQuote;
}>;
export type CandidateEligibility = Readonly<{
  source: MarketSource; family: MarketFamily; selection: MarketSelection; probability: number;
  eligible: boolean; reasons: readonly string[]; evidence: Readonly<Record<string, unknown>>;
}>;
/** Private immutable revision audit. Public projections must omit quote and source receipts unless authorized. */
export type RecommendationDecision = Readonly<{
  version: 1; policyVersion: string; fixtureId: string; fixtureVersion: string; homeTeamId: string; awayTeamId: string;
  analysisAt: number; evidenceSnapshotId: string; evidenceHash: string;
  status: "selected" | "no-qualified-recommendation"; selected: RecommendationPick | null;
  decisions: readonly CandidateEligibility[]; fallbackReason: string | null; explanation: string;
}>;
