import { z } from "zod";
import { storedMatchFeedRecordSchema } from "./match-feed.ts";
import { isMarketSelection, type MarketFamily, type MarketSelection } from "./markets.ts";
import { marketFamilySchema } from "./fixture-snapshot.ts";
import { completedFixtureStatuses, isCompletedFixtureStatus, isPlayedFinalStatus, settleMarketSelection, type CycleEligibility, type SettlementStatus } from "./market-settlement.ts";
import { slipBuilderRules, type BuiltSlip, type SlipCriteria, type SlipForecastReference } from "./slip-builder.ts";
import { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";
import type { SlipMatchProgress } from "./slip-match-state.ts";
import { slipOutcome } from "./slip-outcome.ts";
import { slipStatus, type SlipStatus } from "./slip-status.ts";
export { slipOutcome } from "./slip-outcome.ts";
export { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";

const record = storedMatchFeedRecordSchema.shape;
/** At most one selection per retained candidate; source quotes have at most four whole digits. */
export const savedSlipSnapshotRules = Object.freeze({
  maximumIdentityLength: slipBuilderRules.maximumSelections * 256,
  maximumTotalOddsDigits: slipBuilderRules.maximumSelections * 4,
  maximumSaveRequestBytes: slipBuilderRules.maximumSelections * 256 + 4096,
});
const selection = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: z.number().int().positive(), homeTeam: record.homeTeam, awayTeam: record.awayTeam,
  competition: record.competition, family: marketFamilySchema, selection: z.string().max(64),
  probability: z.number().min(0).max(1), odds: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
  oddsBasis: z.enum(["bookmaker", "median"]),
  forecast: slipForecastReferenceSchema.optional(),
}).refine((value) => isMarketSelection(value.family, value.selection), "Invalid saved selection.");

/** Only server-generated snapshots are persisted. No member identity is part of a public saved slip. */
export const savedSlipSnapshotSchema = z.strictObject({
  id: z.string().min(1).max(savedSlipSnapshotRules.maximumIdentityLength), selections: z.array(selection).min(1).max(slipBuilderRules.maximumSelections),
  totalOdds: z.string().max(savedSlipSnapshotRules.maximumTotalOddsDigits + 3).regex(/^\d+\.\d{2}$/u), oddsBasis: z.enum(["bookmaker", "median"]),
  averageProbability: z.number().min(0).max(1),
}).refine((value) => new Set(value.selections.map((item) => item.fixtureId)).size === value.selections.length,
  "A fixture can appear only once in a slip.");

export type SavedSlipResult = Readonly<{
  fixtureId: string; status: SettlementStatus; regulationVerified: boolean; regulationHome: number | null; regulationAway: number | null;
  forecast?: SlipForecastReference;
  family?: MarketFamily;
  selection?: MarketSelection;
  /** A terminal original cycle stays complete even when a replacement fixture is active. */
  completed?: boolean;
  /** Current canonical fixture completion, independent of adjudication of an older prediction cycle. */
  fixtureCompleted?: boolean;
  cycleEligibility?: CycleEligibility;
  /** Validated current/original-cycle presentation facts; never part of the persisted slip. */
  progress?: SlipMatchProgress;
}>;
export const savedSlipCompletedStatuses: readonly SettlementStatus[] = completedFixtureStatuses;
export type SavedSlipView = Readonly<{
  id: string; savedAt: string; slip: BuiltSlip; outcome: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
  results: readonly Readonly<{ fixtureId: string; home: number | null; away: number | null; outcome: "correct" | "incorrect" | "pending" | "void" }>[];
}>;
export type SavedSlipHistoryQuery = Pick<SlipCriteria, "dateFrom" | "dateTo" | "timeFrom" | "timeTo">;
export type SavedSlipHistory = Readonly<{
  records: readonly SavedSlipView[]; asOf: number;
  /** The entire selected original-kickoff cohort; only completed visible records are limited. */
  statistics: PerformanceSummaryCounts;
}>;

/** Bound forecasts follow their original cycle. Legacy snapshots still require a terminal current fixture;
 * no original identity is guessed for an old member save. */
export function savedSlipView(id: string, savedAt: string, snapshot: unknown, results: readonly SavedSlipResult[]): SavedSlipView | null {
  const parsed = savedSlipSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const slip = parsed.data as BuiltSlip;
  const legs = savedSlipLegResults(slip, results);
  if (legs.some((leg) => leg === null)) return null;
  const finished = legs.filter((leg) => leg !== null);
  const outcome = slipOutcome(legs);
  return { id, savedAt, slip, results: finished, outcome, status: savedSlipStatus(slip, results, outcome) };
}

/** Aggregate outcomes can establish a loss before every leg completes, without releasing active selections. */
export function savedSlipOutcome(slip: BuiltSlip, results: readonly SavedSlipResult[]): SavedSlipView["outcome"] {
  return slipOutcome(savedSlipLegResults(slip, results));
}

/** Keeps cancelled/active presentation tied to the same original identities as settlement, including legacy saves. */
export function savedSlipStatus(slip: BuiltSlip, results: readonly SavedSlipResult[], outcome = savedSlipOutcome(slip, results)): SlipStatus {
  const legs = savedSlipLegResults(slip, results);
  const states = slip.selections.flatMap((selection, index) => {
    const result = matchingSavedSlipResult(selection, results);
    return result ? [{ fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(selection.forecast ? { forecast: selection.forecast } : {}), status: result.status, score: null, liveClock: null,
      outcome: legs[index]?.outcome ?? "pending" as const }] : [];
  });
  return slipStatus(slip, states, outcome);
}

function matchingSavedSlipResult(item: BuiltSlip["selections"][number], results: readonly SavedSlipResult[]) {
  return results.find((candidate) => candidate.fixtureId === item.fixtureId && (item.forecast
    ? candidate.forecast?.cycleId === item.forecast.cycleId && candidate.forecast.revisionId === item.forecast.revisionId
      && candidate.forecast.publishedAt === item.forecast.publishedAt && candidate.family === item.family && candidate.selection === item.selection
    : candidate.forecast === undefined));
}

/** Public slips require every original selection to be complete and every canonical fixture to have ended. */
export function savedSlipCompleted(slip: BuiltSlip, results: readonly SavedSlipResult[]): boolean {
  return slip.selections.length > 0 && slip.selections.every((selection) => {
    const result = matchingSavedSlipResult(selection, results);
    return result !== undefined && (result.fixtureCompleted ?? isCompletedFixtureStatus(result.status))
      && (!selection.forecast || result.completed === true);
  });
}

function savedSlipLegResults(slip: BuiltSlip, results: readonly SavedSlipResult[]) {
  return slip.selections.map((item) => {
    const result = matchingSavedSlipResult(item, results);
    if (!result || (item.forecast ? result.completed !== true : !savedSlipCompletedStatuses.includes(result.status))) return null;
    const score = isPlayedFinalStatus(result.status) && result.regulationVerified && result.regulationHome !== null && result.regulationAway !== null
      ? { verified: true as const, period: "regulation-including-stoppage-time" as const, home: result.regulationHome, away: result.regulationAway } : null;
    const settled = settleMarketSelection(item.family, item.selection, { status: result.status,
      cycleEligibility: result.cycleEligibility ?? { eligible: true }, regulationScore: score });
    return { fixtureId: item.fixtureId, home: score?.home ?? null, away: score?.away ?? null,
      outcome: settled.status === "correct" || settled.status === "incorrect" || settled.status === "void" ? settled.status : "pending" as const };
  });
}
