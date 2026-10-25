import { oddsRules } from "./odds.ts";
import type { PerformanceReturns } from "./performance.ts";

/** One locked family prediction in a performance cell, with the public price recorded at its publication. */
export type PredictionReturnSample = Readonly<{
  id: string;
  kickoffAt: number;
  publishedAt: number;
  outcome: "won" | "lost" | "void" | "pending";
  quote: "missing" | "unavailable" | Readonly<{ hundredths: number }>;
}>;

/** Every sample in the cell is required; never summarize only a page of predictions.
 * A void forecast does not establish a bookmaker refund, so void/pending predictions never enter returns
 * or any price aggregate. Quotes are accumulated exactly in hundredths before converting to display units. */
export function summarizePredictionReturns(samples: readonly PredictionReturnSample[], quotesEnabled: boolean): PerformanceReturns {
  const ids = new Set<string>();
  for (const sample of samples) {
    const quote = sample.quote;
    if (!sample.id || ids.has(sample.id) || !Number.isSafeInteger(sample.kickoffAt) || !Number.isSafeInteger(sample.publishedAt) ||
      !["won", "lost", "void", "pending"].includes(sample.outcome) || (typeof quote === "string" ? quote !== "missing" && quote !== "unavailable"
        : !quote || !Number.isInteger(quote.hundredths) || quote.hundredths < oddsRules.minimumHundredths || quote.hundredths > oddsRules.maximumHundredths)) {
      throw new RangeError("Invalid prediction returns cohort.");
    }
    ids.add(sample.id);
  }
  let won = 0, lost = 0, priced = 0, missing = 0, unavailable = 0;
  let returnHundredths = 0n, oddsHundredths = 0n, longest = 0, streak = 0;
  const ordered = [...samples].sort((a, b) => a.kickoffAt - b.kickoffAt || a.publishedAt - b.publishedAt || a.id.localeCompare(b.id, "en"));
  for (const sample of ordered) {
    if (sample.outcome === "void" || sample.outcome === "pending") { streak = 0; continue; }
    if (sample.outcome === "won") { won++; streak = 0; }
    else { lost++; streak++; longest = Math.max(longest, streak); }
    if (!quotesEnabled) continue;
    if (sample.quote === "missing") { missing++; continue; }
    if (sample.quote === "unavailable") { unavailable++; continue; }
    const odds = BigInt(sample.quote.hundredths);
    priced++; oddsHundredths += odds;
    if (sample.outcome === "won") returnHundredths += odds;
  }
  const stakeHundredths = BigInt(priced) * 100n, profitHundredths = returnHundredths - stakeHundredths;
  if ([returnHundredths, oddsHundredths, stakeHundredths, profitHundredths].some((value) =>
    value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))) {
    throw new RangeError("Prediction returns cohort exceeds exact arithmetic bounds.");
  }
  const available = quotesEnabled && priced > 0;
  return { basis: "one-unit-per-settled-prediction-original-public-quote-at-publication",
    streakBasis: "kickoff-publication-revision-in-period-void-and-pending-interrupt",
    state: available ? "available" : "unavailable",
    reason: available ? null : quotesEnabled ? "no-quoted-settled-predictions" : "odds-display-disabled",
    settled: won + lost, won, lost, returnsSampleCount: priced, missingQuoteCount: missing, unavailableQuoteCount: unavailable,
    stakeUnits: available ? priced : null, returnUnits: available ? Number(returnHundredths) / 100 : null,
    profitUnits: available ? Number(profitHundredths) / 100 : null,
    roi: available ? Number(profitHundredths) / Number(stakeHundredths) : null,
    meanQuotedOdds: available ? Number(oddsHundredths) / (100 * priced) : null,
    longestLosingStreak: longest, currentLosingStreak: streak };
}
