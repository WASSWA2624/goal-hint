import { summarizeSlipPerformance } from "./slip-performance.ts";

export type PickPerformanceSample = Readonly<{
  revisionId: string;
  publishedAt: number;
  outcome: "won" | "lost" | "void" | "pending";
  /** Exact stored pre-publication quote for this locked selection; never a current price. */
  quotedOdds: string | null;
}>;

export type PickPerformanceSummary = Readonly<{
  basis: "one-unit-per-binary-locked-pick-stored-pre-publication-quote";
  streakBasis: "forecast-publication-time-revision-in-period-void-and-pending-interrupt";
  settled: number;
  returnsSampleCount: number;
  excludedQuoteCount: number;
  stakeUnits: number;
  returnUnits: number;
  profitUnits: number;
  roi: number | null;
  meanQuotedOdds: number | null;
  longestLosingStreak: number;
  currentLosingStreak: number;
}>;

/** Reuse the publication illustration's exact arithmetic and exclusions, with a separate pick denominator. */
export function summarizePickPerformance(samples: readonly PickPerformanceSample[]): PickPerformanceSummary {
  const summary = summarizeSlipPerformance(samples.map((sample) => ({ id: sample.revisionId,
    publishedAt: sample.publishedAt, outcome: sample.outcome, totalOdds: sample.quotedOdds ?? "" })));
  return { basis: "one-unit-per-binary-locked-pick-stored-pre-publication-quote",
    streakBasis: "forecast-publication-time-revision-in-period-void-and-pending-interrupt", settled: summary.settled,
    returnsSampleCount: summary.returnsSampleCount, excludedQuoteCount: summary.excludedQuoteCount,
    stakeUnits: summary.stakeUnits, returnUnits: summary.returnUnits, profitUnits: summary.profitUnits,
    roi: summary.roi, meanQuotedOdds: summary.meanQuotedOdds, longestLosingStreak: summary.longestLosingStreak,
    currentLosingStreak: summary.currentLosingStreak };
}
