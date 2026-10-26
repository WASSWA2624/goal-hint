/** Descriptive publication outcomes, separate from forecast-quality claims and bookmaker payouts. */
export type SlipPerformanceSample = Readonly<{
  id: string;
  publishedAt: number;
  totalOdds: string;
  outcome: "won" | "lost" | "void" | "pending";
  rank?: number;
}>;

export type SlipPerformanceSummary = Readonly<{
  basis: "one-unit-per-binary-slip-original-quoted-odds";
  streakBasis: "publication-time-rank-id-in-period-void-and-pending-interrupt";
  total: number;
  won: number;
  lost: number;
  void: number;
  pending: number;
  settled: number;
  winRate: number | null;
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

/** All samples in the selected publication period are required; never summarize only a history page.
 * A void forecast does not establish a bookmaker refund, so void/pending slips do not enter returns.
 * Decimal quoted totals are accumulated exactly in hundredths before converting to display units. */
export function summarizeSlipPerformance(samples: readonly SlipPerformanceSample[]): SlipPerformanceSummary {
  const ids = new Set<string>();
  for (const sample of samples) {
    if (!sample.id || ids.has(sample.id) || !Number.isSafeInteger(sample.publishedAt) ||
      sample.rank !== undefined && (!Number.isInteger(sample.rank) || sample.rank < 1 || sample.rank > 10) ||
      !["won", "lost", "void", "pending"].includes(sample.outcome)) throw new RangeError("Invalid slip performance cohort.");
    ids.add(sample.id);
  }
  let won = 0, lost = 0, voidCount = 0, pending = 0, priced = 0, excluded = 0;
  let returnHundredths = 0n, oddsHundredths = 0n, longest = 0, streak = 0;
  const ordered = [...samples].sort((a, b) => a.publishedAt - b.publishedAt || (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id, "en"));
  for (const sample of ordered) {
    if (sample.outcome === "void") { voidCount++; streak = 0; continue; }
    if (sample.outcome === "pending") { pending++; streak = 0; continue; }
    if (sample.outcome === "won") { won++; streak = 0; }
    else { lost++; streak++; longest = Math.max(longest, streak); }
    const match = /^(\d{1,6})\.(\d{2})$/u.exec(sample.totalOdds);
    const odds = match ? BigInt(match[1]!) * 100n + BigInt(match[2]!) : null;
    if (odds === null || odds <= 100n) { excluded++; continue; }
    priced++; oddsHundredths += odds;
    if (sample.outcome === "won") returnHundredths += odds;
  }
  const settled = won + lost, stakeHundredths = BigInt(priced) * 100n;
  const profitHundredths = returnHundredths - stakeHundredths;
  if ([returnHundredths, oddsHundredths, stakeHundredths, profitHundredths].some((value) =>
    value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))) {
    throw new RangeError("Slip performance cohort exceeds exact arithmetic bounds.");
  }
  return { basis: "one-unit-per-binary-slip-original-quoted-odds", streakBasis: "publication-time-rank-id-in-period-void-and-pending-interrupt",
    total: samples.length, won, lost, void: voidCount, pending, settled, winRate: settled ? won / settled : null,
    returnsSampleCount: priced, excludedQuoteCount: excluded, stakeUnits: priced,
    returnUnits: Number(returnHundredths) / 100, profitUnits: Number(profitHundredths) / 100,
    roi: priced ? Number(profitHundredths) / Number(stakeHundredths) : null,
    meanQuotedOdds: priced ? Number(oddsHundredths) / (100 * priced) : null,
    longestLosingStreak: longest, currentLosingStreak: streak };
}
