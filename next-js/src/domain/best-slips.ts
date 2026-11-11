import { defaultSlipCriteria, buildSlips, type BuiltSlip, type SlipCriteria } from "./slip-builder.ts";
import { oddsRules } from "./odds.ts";
import { compareSlipEstimates, jointSlipBuilder, type JointSlipModel } from "./joint-slip-model.ts";
export { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "./joint-slip-model.ts";
import type { ReportingDate } from "./calendar.ts";
import type { SlipBuildState } from "./slip-page.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "./slip-match-state.ts";
import type { BestSlipsQuery } from "./best-slips-query.ts";
import type { SlipStatus } from "./slip-status.ts";
import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { CardSnapshotPick } from "./match-card.ts";
import type { PeriodPerformance } from "./browse-period.ts";
import type { ContentAccess } from "./paywall.ts";
import { bestSlipBand, bestSlipBandLimit, bestSlipOddsBands, defaultBestSlipOddsBand, type BestSlipOddsBand } from "./best-slip-odds-bands.ts";

export const bestSlipsRules = Object.freeze({ minimumTotal: bestSlipBand().minimumTotal, maximumTotal: bestSlipBand().maximumTotal,
  count: bestSlipOddsBands.length * bestSlipBandLimit, perBand: bestSlipBandLimit });

export type BestSlip = BuiltSlip & Readonly<{ estimatedProbability: number }>;
export function compareBestSlips(left: BestSlip, right: BestSlip): number {
  return compareSlipEstimates(left, right, left.estimatedProbability, right.estimatedProbability);
}
export type BestSlipSummary = Readonly<{
  rank: number; totalOdds: string; estimatedProbability: number; averageProbability: number; matchCount: number;
}>;
export type SlipPreviewView = Omit<BestSlipSummary, "estimatedProbability"> & Readonly<{
  slip?: BuiltSlip; matchStates?: readonly SlipMatchState[];
  preview?: readonly Readonly<{ fixture: FixtureSnapshot; pick: CardSnapshotPick | null }>[];
  /** Internal read proof; removed by the response projection. Never inferred from slip outcome. */
  completedFixtureIds?: readonly string[];
  id?: string; publicationDay?: ReportingDate; publishedAt?: number; outcome?: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
  /** Server proof that every original selection and its canonical fixture are complete. */
  completed?: boolean;
}>;
export type BestSlipView = SlipPreviewView & Readonly<{ estimatedProbability: number; slip?: BestSlip }>;
export type SlipsBrowseResult<T extends SlipPreviewView = SlipPreviewView> = Readonly<{
  day: ReportingDate; state: SlipBuildState | "model-unavailable"; slips: readonly T[];
  /** Unfinished prediction access, freshly checked at the response boundary. */
  entitled?: boolean;
  access?: ContentAccess;
  searchLimited: boolean; partialCoverage: boolean;
  /** The complete date cohort before result filtering or pagination. */
  statistics?: PerformanceSummaryCounts | null;
  summary?: PeriodPerformance;
  browse?: Readonly<{
    query: BestSlipsQuery; firstPage?: number; version?: string | null; total: number | null; pageSize: number; hasMore: boolean; nextCursor: string | null;
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

export function bestSlipBuilder(model: JointSlipModel) {
  return ((criteria, records, asOf) => {
    const result = jointSlipBuilder(model)(criteria, records, asOf);
    return { ...result, slips: result.slips.map((slip): BestSlip => ({ ...slip, estimatedProbability: result.jointProbabilities![slip.id]!,
      selections: [...slip.selections].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId)) })) };
  }) satisfies typeof buildSlips;
}

/** Aggregate projection allowlist; viewer access and completion eligibility are enforced by the slip service. */
export function bestSlipViews(slips: readonly BestSlip[], entitled: boolean, matchStates?: readonly SlipMatchState[]): readonly BestSlipView[] {
  return [...slips].sort(compareBestSlips).map((slip, index) => ({ rank: index + 1, matchCount: slip.selections.length,
    totalOdds: slip.totalOdds, estimatedProbability: slip.estimatedProbability, averageProbability: slip.averageProbability,
    ...(entitled ? { slip, ...(matchStates ? { matchStates: slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, matchStates); return state ? [state] : [];
    }) } : {}) } : {}) }));
}
