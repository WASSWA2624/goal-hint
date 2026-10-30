import { isPlayedFinalStatus } from "./market-settlement.ts";
import type { SavedSlipView } from "./saved-slips.ts";
import type { BuiltSlip } from "./slip-builder.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "./slip-match-state.ts";

/** Presentation progress is separate from settled wager outcomes. Pending means progress is not known. */
export type SlipStatus = "not-started" | "in-progress" | "pending" | "won" | "lost" | "void" | "cancelled";

/** Uses recorded original-selection progress and a separately adjudicated outcome; no clock or score settles a slip. */
export function slipStatus(slip: BuiltSlip, states: readonly SlipMatchState[] = [],
  outcome: SavedSlipView["outcome"] = "pending", fallback?: SlipStatus): SlipStatus {
  const legs = slip.selections.map((selection) => slipMatchStateForSelection(selection, states));
  if (outcome === "won" || outcome === "lost") return outcome;
  if (outcome === "void") {
    return legs.length > 0 && legs.every((leg) => leg?.status === "canceled" && leg.outcome === "void")
      || !legs.some(Boolean) && fallback === "cancelled" ? "cancelled" : "void";
  }
  if (legs.some((leg) => leg && (leg.status === "live" || isPlayedFinalStatus(leg.status) || leg.status === "abandoned"))) return "in-progress";
  if (legs.length > 0 && legs.every((leg) => leg?.status === "scheduled" || leg?.status === "canceled" && leg.outcome === "void")) return "not-started";
  return !legs.some(Boolean) && (fallback === "not-started" || fallback === "in-progress") ? fallback : "pending";
}

/** Pending is the filter/count umbrella for every unsettled progress state. */
export function slipStatusCategory(status: SlipStatus): "won" | "lost" | "pending" | "void" | "cancelled" {
  return status === "not-started" || status === "in-progress" ? "pending" : status;
}
