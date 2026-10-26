import type { SlipSelection } from "./slip-builder.ts";

/** Chance of every selected prediction winning, assuming independent matches. Keep source precision until display. */
export function independentSlipProbability(selections: readonly Pick<SlipSelection, "probability">[]): number | null {
  if (selections.length === 0) return null;
  let combined = 1;
  for (const selection of selections) {
    const probability = selection?.probability;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) return null;
    combined *= probability;
  }
  return combined;
}
