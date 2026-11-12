import { isMarketSelection, marketSelections, type MarketSelection } from "./markets.ts";
import type { SlipForecastReference } from "./slip-forecast-reference.ts";

export const total15SlipSelections = ["over-1.5", "under-1.5"] as const;
export type Total15SlipSelection = typeof total15SlipSelections[number];
export type SlipMarketSelection = MarketSelection | Total15SlipSelection;
export const slipMarketSelections = {
  ...marketSelections,
  "total-goals": [...marketSelections["total-goals"], ...total15SlipSelections],
} as const;

export function isTotal15SlipSelection(selection: unknown): selection is Total15SlipSelection {
  return total15SlipSelections.some((outcome) => outcome === selection);
}

export function isSlipMarketSelection(family: unknown, selection: unknown): selection is SlipMarketSelection {
  return isMarketSelection(family, selection) || family === "total-goals" && isTotal15SlipSelection(selection);
}

export function total15Direction(selection: Total15SlipSelection): "over" | "under" {
  return selection === "over-1.5" ? "over" : "under";
}

/** The two complementary probabilities are from the same sealed goal-model revision. */
export type SlipTotal15Forecast = Readonly<{
  reference: SlipForecastReference;
  source: "ai-score-distribution" | "local-poisson";
  probabilities: Readonly<Record<Total15SlipSelection, number>>;
}>;

export function matchesSlipForecast(left: SlipForecastReference, right: SlipForecastReference): boolean {
  return left.cycleId === right.cycleId && left.revisionId === right.revisionId && left.publishedAt === right.publishedAt;
}
