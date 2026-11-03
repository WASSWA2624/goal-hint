import type { SlipResultView } from "./slip-snapshot.ts";

/** Aggregate normalized results with one slot per original selection, retaining unknown legs as null. */
export function slipOutcome(legs: readonly (SlipResultView["results"][number] | null)[]): SlipResultView["outcome"] {
  return legs.some((leg) => leg?.outcome === "incorrect") ? "lost"
    : legs.some((leg) => leg === null || leg.outcome === "pending") ? "pending"
      : legs.some((leg) => leg?.outcome === "void") ? "void" : "won";
}
