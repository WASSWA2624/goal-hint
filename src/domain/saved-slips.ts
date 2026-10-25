import { z } from "zod";
import { storedMatchFeedRecordSchema } from "./match-feed.ts";
import { isMarketSelection } from "./markets.ts";
import { marketFamilySchema } from "./fixture-snapshot.ts";
import { isPlayedFinalStatus, settleMarketSelection, type SettlementStatus } from "./market-settlement.ts";
import { slipBuilderRules, type BuiltSlip } from "./slip-builder.ts";

const record = storedMatchFeedRecordSchema.shape;
const selection = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: z.number().int().positive(), homeTeam: record.homeTeam, awayTeam: record.awayTeam,
  competition: record.competition, family: marketFamilySchema, selection: z.string().max(64),
  probability: z.number().min(0).max(1), odds: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
  oddsBasis: z.enum(["bookmaker", "median"]),
}).refine((value) => isMarketSelection(value.family, value.selection), "Invalid saved selection.");

/** Only server-generated snapshots are persisted. No member identity is part of a public saved slip. */
export const savedSlipSnapshotSchema = z.strictObject({
  id: z.string().min(1).max(4096), selections: z.array(selection).min(1).max(slipBuilderRules.maximumSelections),
  totalOdds: z.string().regex(/^\d{1,6}\.\d{2}$/u), oddsBasis: z.enum(["bookmaker", "median"]),
  averageProbability: z.number().min(0).max(1),
}).refine((value) => new Set(value.selections.map((item) => item.fixtureId)).size === value.selections.length,
  "A fixture can appear only once in a slip.");

export type SavedSlipResult = Readonly<{
  fixtureId: string; status: SettlementStatus; regulationVerified: boolean; regulationHome: number | null; regulationAway: number | null;
}>;
export const savedSlipCompletedStatuses: readonly SettlementStatus[] = Object.freeze([
  "finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded",
]);
export type SavedSlipView = Readonly<{
  id: string; savedAt: string; slip: BuiltSlip; outcome: "won" | "lost" | "pending" | "void";
  results: readonly Readonly<{ fixtureId: string; home: number | null; away: number | null; outcome: "correct" | "incorrect" | "pending" | "void" }>[];
}>;

/** Public history requires every leg to be played-final or terminal-void. A postponement can resume;
 * legacy snapshots lack the recorded cycle identity required to resolve that historical leg safely. */
export function savedSlipView(id: string, savedAt: string, snapshot: unknown, results: readonly SavedSlipResult[]): SavedSlipView | null {
  const parsed = savedSlipSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const slip = parsed.data as BuiltSlip;
  const legs = slip.selections.map((item) => {
    const result = results.find((candidate) => candidate.fixtureId === item.fixtureId);
    if (!result || !savedSlipCompletedStatuses.includes(result.status)) return null;
    const score = isPlayedFinalStatus(result.status) && result.regulationVerified && result.regulationHome !== null && result.regulationAway !== null
      ? { verified: true as const, period: "regulation-including-stoppage-time" as const, home: result.regulationHome, away: result.regulationAway } : null;
    const settled = settleMarketSelection(item.family, item.selection, { status: result.status, cycleEligibility: { eligible: true }, regulationScore: score });
    return { fixtureId: item.fixtureId, home: score?.home ?? null, away: score?.away ?? null,
      outcome: settled.status === "correct" || settled.status === "incorrect" || settled.status === "void" ? settled.status : "pending" as const };
  });
  if (legs.some((leg) => leg === null)) return null;
  const finished = legs.filter((leg) => leg !== null);
  return { id, savedAt, slip, results: finished,
    outcome: finished.some((leg) => leg.outcome === "incorrect") ? "lost" : finished.some((leg) => leg.outcome === "pending") ? "pending"
      : finished.some((leg) => leg.outcome === "void") ? "void" : "won" };
}
