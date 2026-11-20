import type { MarketFamily, MarketSelection, MarketSource } from "./markets.ts";
import { parseDecimalOdds } from "./odds.ts";
import { publicPolicy } from "./public-policy.ts";

/** Frozen policy for decisions and refresh intents created before probability-first ranking. */
const oddsFirstRecommendationPolicy = Object.freeze({
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

/** Provisional engineering policy, not a calibrated accuracy or profitability claim. */
export const recommendationPolicy = Object.freeze({
  ...oddsFirstRecommendationPolicy,
  version: "probability-then-odds-v2",
  tieBreak: "probability-decimal-odds-policy-order" as const,
});
export const evidenceFirstRecommendationPolicy = Object.freeze({ ...recommendationPolicy,
  version: "probability-confidence-odds-v3", minimumProbability: 0, tieBreak: "probability-confidence-decimal-odds-key" as const });
const supportedRecommendationPolicies = [oddsFirstRecommendationPolicy, recommendationPolicy, evidenceFirstRecommendationPolicy] as const;
export type RecommendationPolicy = typeof supportedRecommendationPolicies[number];

export function recommendationPolicyForVersion(version: unknown): RecommendationPolicy | undefined {
  return supportedRecommendationPolicies.find((policy) => policy.version === version);
}
export const forecastConfidence = ["limited", "supported", "calibrated"] as const;
export type ForecastConfidence = typeof forecastConfidence[number];
export type ComparableForecastPick = Readonly<{ key: string; selection: string; probability: number;
  confidence?: ForecastConfidence; odds: string | null }>;

const lexical = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
/** Probability and evidence reliability are separate. Prices can decide only a tie on both. */
export function compareForecastPicks(left: ComparableForecastPick, right: ComparableForecastPick): number {
  const probability = right.probability - left.probability;
  if (probability) return probability;
  const confidence = (right.confidence ? forecastConfidence.indexOf(right.confidence) + 1 : 0) -
    (left.confidence ? forecastConfidence.indexOf(left.confidence) + 1 : 0);
  if (confidence) return confidence;
  const leftPrice = left.odds === null ? 0n : parseDecimalOdds(left.odds)?.scaled ?? 0n;
  const rightPrice = right.odds === null ? 0n : parseDecimalOdds(right.odds)?.scaled ?? 0n;
  return leftPrice === rightPrice ? lexical(left.key, right.key) || lexical(left.selection, right.selection) : leftPrice > rightPrice ? -1 : 1;
}
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
  quote: RecommendationQuote | null;
  confidence?: ForecastConfidence;
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
