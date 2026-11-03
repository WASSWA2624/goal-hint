import { z } from "zod";
import { storedMatchFeedRecordSchema } from "./match-feed.ts";
import { isMarketSelection, type MarketFamily, type MarketSelection } from "./markets.ts";
import { marketFamilySchema } from "./fixture-snapshot.ts";
import { completedFixtureStatuses, isCompletedFixtureStatus, isPlayedFinalStatus, settleMarketSelection, type CycleEligibility, type SettlementStatus } from "./market-settlement.ts";
import { slipBuilderRules, type BuiltSlip, type SlipForecastReference } from "./slip-builder.ts";
import { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";
import type { SlipMatchProgress } from "./slip-match-state.ts";
import { slipOutcome } from "./slip-outcome.ts";
import { slipStatus, type SlipStatus } from "./slip-status.ts";
export { slipOutcome } from "./slip-outcome.ts";
export { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";

const record = storedMatchFeedRecordSchema.shape;
/** At most one selection per retained candidate; source quotes have at most four whole digits. */
export const slipSnapshotRules = Object.freeze({
  maximumIdentityLength: slipBuilderRules.maximumSelections * 256,
  maximumTotalOddsDigits: slipBuilderRules.maximumSelections * 4,
  maximumRequestBytes: slipBuilderRules.maximumSelections * 256 + 4096,
});
const selection = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: z.number().int().positive(), homeTeam: record.homeTeam, awayTeam: record.awayTeam,
  competition: record.competition, family: marketFamilySchema, selection: z.string().max(64),
  probability: z.number().min(0).max(1), odds: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
  oddsBasis: z.enum(["bookmaker", "median"]),
  forecast: slipForecastReferenceSchema.optional(),
}).refine((value) => isMarketSelection(value.family, value.selection), "Invalid slip selection.");

/** Neutral slip data shared by transient builders, image exports and editorial publications. */
export const slipSnapshotSchema = z.strictObject({
  id: z.string().min(1).max(slipSnapshotRules.maximumIdentityLength), selections: z.array(selection).min(1).max(slipBuilderRules.maximumSelections),
  totalOdds: z.string().max(slipSnapshotRules.maximumTotalOddsDigits + 3).regex(/^\d+\.\d{2}$/u), oddsBasis: z.enum(["bookmaker", "median"]),
  averageProbability: z.number().min(0).max(1),
}).refine((value) => new Set(value.selections.map((item) => item.fixtureId)).size === value.selections.length,
  "A fixture can appear only once in a slip.");

export type SlipResult = Readonly<{
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
export const slipCompletedStatuses: readonly SettlementStatus[] = completedFixtureStatuses;
export type SlipResultView = Readonly<{
  id: string; createdAt: string; slip: BuiltSlip; outcome: "won" | "lost" | "pending" | "void";
  status?: SlipStatus;
  results: readonly Readonly<{ fixtureId: string; home: number | null; away: number | null; outcome: "correct" | "incorrect" | "pending" | "void" }>[];
}>;
/** Bound forecasts follow their original cycle. Legacy snapshots still require a terminal current fixture;
 * no original identity is guessed for an old member save. */
export function slipResultView(id: string, createdAt: string, snapshot: unknown, results: readonly SlipResult[]): SlipResultView | null {
  const parsed = slipSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const slip = parsed.data as BuiltSlip;
  const legs = slipLegResults(slip, results);
  if (legs.some((leg) => leg === null)) return null;
  const finished = legs.filter((leg) => leg !== null);
  const outcome = slipOutcome(legs);
  return { id, createdAt, slip, results: finished, outcome, status: slipSnapshotStatus(slip, results, outcome) };
}

/** Aggregate outcomes can establish a loss before every leg completes, without releasing active selections. */
export function slipSnapshotOutcome(slip: BuiltSlip, results: readonly SlipResult[]): SlipResultView["outcome"] {
  return slipOutcome(slipLegResults(slip, results));
}

/** Keeps cancelled/active presentation tied to the same original identities as settlement, including legacy saves. */
export function slipSnapshotStatus(slip: BuiltSlip, results: readonly SlipResult[], outcome = slipSnapshotOutcome(slip, results)): SlipStatus {
  const legs = slipLegResults(slip, results);
  const states = slip.selections.flatMap((selection, index) => {
    const result = matchingSlipResult(selection, results);
    return result ? [{ fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(selection.forecast ? { forecast: selection.forecast } : {}), status: result.status, score: null, liveClock: null,
      outcome: legs[index]?.outcome ?? "pending" as const }] : [];
  });
  return slipStatus(slip, states, outcome);
}

function matchingSlipResult(item: BuiltSlip["selections"][number], results: readonly SlipResult[]) {
  return results.find((candidate) => candidate.fixtureId === item.fixtureId && (item.forecast
    ? candidate.forecast?.cycleId === item.forecast.cycleId && candidate.forecast.revisionId === item.forecast.revisionId
      && candidate.forecast.publishedAt === item.forecast.publishedAt && candidate.family === item.family && candidate.selection === item.selection
    : candidate.forecast === undefined));
}

/** Public slips require every original selection to be complete and every canonical fixture to have ended. */
export function slipCompleted(slip: BuiltSlip, results: readonly SlipResult[]): boolean {
  return slip.selections.length > 0 && completedSlipFixtureIds(slip, results).length === slip.selections.length;
}

/** Per-leg release uses the same original-cycle proof as complete public slips. */
export function completedSlipFixtureIds(slip: BuiltSlip, results: readonly SlipResult[]): readonly string[] {
  return slip.selections.flatMap((selection) => {
    const result = matchingSlipResult(selection, results);
    return result !== undefined && (result.fixtureCompleted ?? isCompletedFixtureStatus(result.status))
      && (!selection.forecast || result.completed === true) ? [selection.fixtureId] : [];
  });
}

function slipLegResults(slip: BuiltSlip, results: readonly SlipResult[]) {
  return slip.selections.map((item) => {
    const result = matchingSlipResult(item, results);
    if (!result || (item.forecast ? result.completed !== true : !slipCompletedStatuses.includes(result.status))) return null;
    const score = isPlayedFinalStatus(result.status) && result.regulationVerified && result.regulationHome !== null && result.regulationAway !== null
      ? { verified: true as const, period: "regulation-including-stoppage-time" as const, home: result.regulationHome, away: result.regulationAway } : null;
    const settled = settleMarketSelection(item.family, item.selection, { status: result.status,
      cycleEligibility: result.cycleEligibility ?? { eligible: true }, regulationScore: score });
    return { fixtureId: item.fixtureId, home: score?.home ?? null, away: score?.away ?? null,
      outcome: settled.status === "correct" || settled.status === "incorrect" || settled.status === "void" ? settled.status : "pending" as const };
  });
}
