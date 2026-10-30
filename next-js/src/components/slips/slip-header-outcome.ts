import type { SavedSlipView } from "../../domain/saved-slips.ts";
import type { BuiltSlip } from "../../domain/slip-builder.ts";
import { slipMatchStateForSelection, type SlipMatchState } from "../../domain/slip-match-state.ts";
import { slipOutcome } from "../../domain/slip-outcome.ts";

/** The header follows the same original-cycle observations as its rows. Scores alone never settle a slip. */
export function slipHeaderOutcome(slip: BuiltSlip, results?: SavedSlipView["results"], states?: readonly SlipMatchState[],
  fallback: SavedSlipView["outcome"] = "pending"): SavedSlipView["outcome"] {
  if (!slip.selections.length || results === undefined && !states?.length) return fallback;
  const byFixture = new Map(results?.map((result) => [result.fixtureId, result]));
  return slipOutcome(slip.selections.map((selection) => {
    const state = slipMatchStateForSelection(selection, states);
    return state ? { fixtureId: selection.fixtureId, home: null, away: null, outcome: state.outcome }
      : byFixture.get(selection.fixtureId) ?? null;
  }));
}
