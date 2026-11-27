import { defaultSlipCriteria, buildSlips, slipCombinationIdentity as bestSlipCombinationIdentity, slipSelectionIdentity as bestSlipSelectionIdentity,
  type BuiltSlip, type EditorialSlipSearch, type SlipBuildResult, type SlipCriteria, type SlipSelection } from "./slip-builder.ts";
export { bestSlipCombinationIdentity, bestSlipSelectionIdentity };
import { oddsRules, parseDecimalOdds } from "./odds.ts";
import { jointSlipBuilder, jointSlipRanking, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
export { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
import { addReportingDays, type ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "./slip-match-state.ts";
import type { BestSlipsQuery } from "./best-slips-query.ts";
import type { SlipStatus } from "./slip-status.ts";
import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { CardSnapshotPick } from "./match-card.ts";
import type { PeriodPerformance } from "./browse-period.ts";
import type { ContentAccess } from "./paywall.ts";
import { bestSlipBand, bestSlipBandLimit, bestSlipExactRange, bestSlipOddsBands, dailyBestSlipBandLimit, defaultBestSlipOddsBand, type BestSlipOddsBand } from "./best-slip-odds-bands.ts";
import { bestSlipFixtureWindow, bestSlipKickoffBufferMs, bestSlipKickoffSpanMs, bestSlipMaximumKickoffSpanMs,
  bestSlipPreferredKickoffWindowMs, bestSlipPublicationIntervalMs } from "./best-slip-publication-hour.ts";
import { slipMarketFamilies } from "./slip-markets.ts";
import { slipProbabilityLowerBound } from "./slip-probability.ts";
import { isEditorialSlipOfferFresh } from "./slip-quote.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: bestSlipBand().minimumTotal, maximumTotal: bestSlipBand().maximumTotal,
  count: bestSlipOddsBands.length * bestSlipBandLimit, perBand: dailyBestSlipBandLimit });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export function bestSlipExactTotal(selections: readonly SlipSelection[]) {
  const denominator = 10_000n ** BigInt(selections.length);
  const product = selections.reduce((value, selection) => value * (parseDecimalOdds(selection.odds)?.scaled ?? 0n), 1n);
  return { product, denominator };
}

function compareBestSlipPrices(a: ReturnType<typeof bestSlipExactTotal>, b: ReturnType<typeof bestSlipExactTotal>) {
  const price = b.product * a.denominator - a.product * b.denominator;
  return price > 0n ? 1 : price < 0n ? -1 : 0;
}
export function compareBestSlips(left: BestSlip, right: BestSlip): number {
  return right.estimatedProbability - left.estimatedProbability ||
    compareBestSlipPrices(bestSlipExactTotal(left.selections), bestSlipExactTotal(right.selections))
    || left.selections.length - right.selections.length || left.id.localeCompare(right.id);
}
export type BestSlipSummary = Readonly<{
  rank: number; totalOdds: string; estimatedProbability: number; averageProbability: number; matchCount: number;
}>;
export type SlipPreviewView = Omit<BestSlipSummary, "estimatedProbability"> & Readonly<{
  estimatedProbability?: number; slip?: BuiltSlip; matchStates?: readonly SlipMatchState[];
  preview?: readonly Readonly<{ fixture: FixtureSnapshot; pick: CardSnapshotPick | null }>[];
  /** Internal read proof; removed by the response projection. Never inferred from slip outcome. */
  completedFixtureIds?: readonly string[];
  id?: string; publicationDay?: ReportingDate; publishedAt?: number; outcome?: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
  /** Server proof that every original selection and its canonical fixture are complete. */
  completed?: boolean;
}>;
export type BestSlipView = SlipPreviewView;
export type SlipsBrowseResult<T extends SlipPreviewView = SlipPreviewView> = Readonly<{
  day: ReportingDate; state: SlipBuildState | "awaiting-publication"; slips: readonly T[];
  /** Unfinished prediction access, freshly checked at the response boundary. */
  entitled?: boolean;
  access?: ContentAccess;
  searchLimited: boolean; partialCoverage: boolean;
  /** The cohort matching the date, odds, probability and match count filters before result filtering or pagination. */
  statistics?: PerformanceSummaryCounts | null;
  summary?: PeriodPerformance;
  browse?: Readonly<{
    query: BestSlipsQuery; firstPage?: number; version?: string | null; total: number | null; pageSize: number; hasMore: boolean; nextCursor: string | null;
    /** Audited band membership before probability, match count and result filters. Unknown across a bounded All dates scan. */
    bandTotal?: number | null;
    /** The current daily capacity when the entire selected day and band use the modern publication rules. */
    dailyBandLimit?: number;
    /** Requested range for exact totals; actually scanned publication dates for All dates. */
    from: ReportingDate | null; to: ReportingDate | null;
  }>;
}>;

export type BestSlipsResult = SlipsBrowseResult<BestSlipView>;

export function bestSlipCriteria(today: string, target: Readonly<{ minimumTotal: number; maximumTotal: number; count: number }>
  = { ...bestSlipBand(defaultBestSlipOddsBand), count: bestSlipBandLimit }): SlipCriteria {
  return { ...defaultSlipCriteria(today), dateTo: today, totalMin: target.minimumTotal, totalMax: target.maximumTotal,
    oddsMin: oddsRules.minimumHundredths, oddsMax: oddsRules.maximumHundredths, teamsMax: 8, slips: target.count, reuse: false };
}

export function bestSlipBandCriteria(today: string, band: BestSlipOddsBand): SlipCriteria {
  return bestSlipCriteria(today, { ...bestSlipBand(band), count: bestSlipBandLimit });
}

export function bestSlipDailyCriteria(today: string, band: BestSlipOddsBand): SlipCriteria {
  const { minimum, maximum } = bestSlipExactRange(band);
  return { ...bestSlipCriteria(today, { minimumTotal: minimum, maximumTotal: maximum, count: dailyBestSlipBandLimit }), probMin: 0 };
}

function cachedPriceOrder() {
  const prices = new WeakMap<BuiltSlip, ReturnType<typeof bestSlipExactTotal>>();
  const exactPrice = (slip: BuiltSlip) => {
    const price = prices.get(slip) ?? bestSlipExactTotal(slip.selections);
    prices.set(slip, price);
    return price;
  };
  return (left: BuiltSlip, right: BuiltSlip) => compareBestSlipPrices(exactPrice(left), exactPrice(right));
}

function kickoffGroups(selections: readonly SlipSelection[]) {
  const kickoffs = [...new Set(selections.map(({ kickoffAt }) => kickoffAt))];
  const gaps = kickoffs.slice(1).map((kickoffAt, index) => kickoffAt - kickoffs[index]!);
  const sortedGaps = [...gaps].sort((left, right) => left - right);
  let nearbyGap = bestSlipPublicationIntervalMs;
  if (sortedGaps.length >= 4) {
    const last = sortedGaps.length - 1, firstQuartile = sortedGaps[Math.floor(last / 4)]!, thirdQuartile = sortedGaps[Math.floor(last * 3 / 4)]!;
    // Break on unusually long gaps in this slate. The cadence remains the fallback for sparse fixtures.
    nearbyGap = Math.min(nearbyGap, thirdQuartile + 1.5 * (thirdQuartile - firstQuartile));
  }
  let group = 0;
  return new Map(kickoffs.map((kickoffAt, index) => {
    if (index > 0 && gaps[index - 1]! > nearbyGap) group++;
    return [kickoffAt, group];
  }));
}

type HourlyBestSlipResult = Omit<SlipBuildResult, "editorialSearch"> & Readonly<{
  alternatives?: readonly BuiltSlip[];
  searchDiagnostics?: Omit<NonNullable<SlipBuildResult["editorialSearch"]>, "alternatives"> & Readonly<{ priorCombinationConflicts: number }>;
}>;

/** Rank same-book combinations from overlapping kickoff windows within the slot's release horizon. */
export function buildHourlyBestSlips(day: ReportingDate, band: BestSlipOddsBand, capacity: number, asOf: number,
  editorial: Omit<EditorialSlipSearch, "exclusiveMaximum" | "combinationIdentity">, priorCombinations: ReadonlySet<string>,
  releaseLookaheadMs = bestSlipPreferredKickoffWindowMs, options: Readonly<{ includeAlternatives?: boolean }> = {}): HourlyBestSlipResult {
  const { startInclusive, endExclusive } = bestSlipFixtureWindow(day);
  const latestKickoff = asOf + releaseLookaheadMs + bestSlipMaximumKickoffSpanMs;
  type SelectionSupport = { minimumPrice: bigint; bookmakers: Set<number> };
  const eligible: SlipSelection[] = [], supportByOutcome = new Map<string, SelectionSupport>();
  const selectionSupport = new Map<SlipSelection, SelectionSupport>();
  for (const selection of editorial.selections) {
    const { fixtureId, kickoffAt, bookmaker, offer } = selection;
    if (editorial.priorFixtures?.has(fixtureId) || kickoffAt < startInclusive || kickoffAt >= endExclusive
      || kickoffAt - asOf < bestSlipKickoffBufferMs || kickoffAt > latestKickoff || !bookmaker || !offer
      || bookmaker.id !== offer.bookmakerId || !isEditorialSlipOfferFresh(offer, asOf)) continue;
    const price = parseDecimalOdds(selection.odds)?.scaled;
    if (price === undefined || price !== parseDecimalOdds(offer.decimal)?.scaled) continue;
    const key = `${kickoffAt}:${bestSlipSelectionIdentity(selection)}`;
    const support = supportByOutcome.get(key) ?? { minimumPrice: price, bookmakers: new Set<number>() };
    if (price < support.minimumPrice) support.minimumPrice = price;
    support.bookmakers.add(bookmaker.id);
    supportByOutcome.set(key, support);
    selectionSupport.set(selection, support);
    eligible.push(selection);
  }
  const groups = kickoffGroups(eligible.sort((left, right) => left.kickoffAt - right.kickoffAt));

  // The shared search creates each combination in kickoff order.
  const firstKickoff = (slip: BuiltSlip) => slip.selections[0]!.kickoffAt;
  function summarize(slip: BuiltSlip) {
    const first = firstKickoff(slip), last = slip.selections.at(-1)!.kickoffAt;
    let maximumPrice = 0n, weakestProbability = 1, minimumSupport = Infinity, totalSupport = 0;
    for (const selection of slip.selections) {
      const { minimumPrice, bookmakers } = selectionSupport.get(selection)!;
      // A different verified quote for the same pick does not change its outcome risk.
      if (minimumPrice > maximumPrice) maximumPrice = minimumPrice;
      weakestProbability = Math.min(weakestProbability, selection.probability);
      minimumSupport = Math.min(minimumSupport, bookmakers.size);
      totalSupport += bookmakers.size;
    }
    return { first, span: bestSlipKickoffSpanMs(slip.selections), firstGroup: groups.get(first)!, lastGroup: groups.get(last)!,
      maximumPrice, weakestProbability, minimumSupport, meanSupport: totalSupport / slip.selections.length,
      // The Fréchet bound uses the stored marginals without assuming independent legs.
      lowerBound: slipProbabilityLowerBound(slip.averageProbability * slip.selections.length, slip.selections.length) };
  }
  const scores = new WeakMap<BuiltSlip, ReturnType<typeof summarize>>();
  const score = (slip: BuiltSlip) => {
    const current = scores.get(slip);
    if (current) return current;
    const summary = summarize(slip);
    scores.set(slip, summary);
    return summary;
  };
  const comparePrice = cachedPriceOrder();
  const compare = (left: BuiltSlip, right: BuiltSlip) => {
    const a = score(left), b = score(right);
    return b.lowerBound - a.lowerBound || b.weakestProbability - a.weakestProbability || right.averageProbability - left.averageProbability
      || b.minimumSupport - a.minimumSupport || b.meanSupport - a.meanSupport || a.span - b.span
      || (a.maximumPrice < b.maximumPrice ? -1 : a.maximumPrice > b.maximumPrice ? 1 : 0)
      || left.selections.length - right.selections.length || a.lastGroup - b.lastGroup || b.firstGroup - a.firstGroup || a.first - b.first
      || comparePrice(left, right) || left.id.localeCompare(right.id);
  };
  let priorCombinationConflicts = 0;
  const { editorialSearch, ...result } = buildSlips({ ...bestSlipDailyCriteria(day, band), dateTo: addReportingDays(day, 1),
    markets: [...slipMarketFamilies], slips: capacity }, [], asOf, {
    accepts: (slip) => {
      if (firstKickoff(slip) - asOf > releaseLookaheadMs || bestSlipKickoffSpanMs(slip.selections) > bestSlipMaximumKickoffSpanMs) return false;
      if (priorCombinations.size && priorCombinations.has(bestSlipCombinationIdentity(slip.selections))) {
        priorCombinationConflicts++;
        return false;
      }
      return true;
    },
    compare,
  }, { editorial: { ...editorial, selections: eligible, prioritizeRank: true,
    maximumKickoffSpanMs: bestSlipMaximumKickoffSpanMs, includeAlternatives: options.includeAlternatives === true,
    combinationIdentity: bestSlipCombinationIdentity, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
  const slips = [...result.slips].sort(compare);
  if (!editorialSearch) return { ...result, slips };
  const { alternatives, ...diagnostics } = editorialSearch;
  return { ...result, slips, alternatives, searchDiagnostics: { ...diagnostics, priorCombinationConflicts } };
}

export function buildDailyBestSlips(day: ReportingDate, band: BestSlipOddsBand, model: JointSlipModel, asOf: number,
  editorial: Omit<EditorialSlipSearch, "exclusiveMaximum" | "combinationIdentity">, priorCombinations: ReadonlySet<string>) {
  if (!qualifiedJointModel(model, asOf)) throw new RangeError("A current calibrated joint model is required.");
  const joint = jointSlipRanking(model);
  const comparePrice = cachedPriceOrder();
  const result = buildSlips(bestSlipDailyCriteria(day, band), [], asOf, {
    probability: joint.probability,
    accepts: (slip) => !priorCombinations.has(bestSlipCombinationIdentity(slip.selections)) && joint.ranking.accepts(slip),
    compare: (left, right) => joint.probability(right)! - joint.probability(left)! || comparePrice(left, right)
      || left.selections.length - right.selections.length || left.id.localeCompare(right.id),
  }, { editorial: { ...editorial, combinationIdentity: bestSlipCombinationIdentity, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
  return { ...result, excludedUnestimated: joint.unestimated(), slips: result.slips.map((slip): BestSlip =>
    ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]! })) };
}

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    const result = jointSlipBuilder(model)(criteria, records, asOf);
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Aggregate projection allowlist; viewer access and completion eligibility are enforced by the slip service. */
export function bestSlipView(slip: BuiltSlip & Readonly<{ estimatedProbability?: number }>, rank: number,
  entitled: boolean, matchStates?: readonly SlipMatchState[]): BestSlipView {
  return { rank, matchCount: slip.selections.length, totalOdds: slip.totalOdds,
    ...(slip.estimatedProbability === undefined ? {} : { estimatedProbability: slip.estimatedProbability }),
    averageProbability: slip.averageProbability,
    ...(entitled ? { slip, ...(matchStates ? { matchStates: slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, matchStates); return state ? [state] : [];
    }) } : {}) } : {}) };
}

export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean, matchStates?: readonly SlipMatchState[]): readonly BestSlipView[] {
  return [...slips].sort(compareBestSlips).map((slip, index) => bestSlipView(slip, index + 1, entitled, matchStates));
}
