import { marketSelections, type MarketSelection } from "./markets.ts";
import { z } from "zod";
import { publicPolicy } from "./public-policy.ts";
import type { SlipForecastReference } from "./slip-forecast-reference.ts";

export const total15SlipSelections = ["over-1.5", "under-1.5"] as const;
export type Total15SlipSelection = typeof total15SlipSelections[number];
const additionalMatchLines = [3.5, 4.5, 5.5] as const;
const teamLines = [1.5, 2.5, ...additionalMatchLines] as const;
const teams = ["home", "away"] as const;
const additionalMatchGoalMarkets = additionalMatchLines.map((line) => ({ family: "total-goals", metric: "total", line,
  key: `goal:full-time:totals:total:${line}:binary`, over: `over-${line}`, under: `under-${line}` } as const));
const teamGoalMarkets = teams.flatMap((metric) => teamLines.map((line) => ({ family: "team-goals", metric, line,
  key: `goal:full-time:totals:${metric}:${line}:binary`, over: `${metric}-over-${line}`, under: `${metric}-under-${line}` } as const)));
export const additionalSlipGoalMarkets = [...additionalMatchGoalMarkets, ...teamGoalMarkets] as const;

export const slipMarketFamilies = [...publicPolicy.markets, "team-goals"] as const;
export const slipMarketFamilySchema = z.enum(slipMarketFamilies);
export type SlipMarketFamily = typeof slipMarketFamilies[number];
const additionalMatchSelections = additionalMatchGoalMarkets.flatMap(({ over, under }) => [over, under]);
const teamSelections = teamGoalMarkets.flatMap(({ over, under }) => [over, under]);
export type SlipMarketSelection = MarketSelection | Total15SlipSelection | typeof additionalMatchSelections[number] | typeof teamSelections[number];
export const slipMarketSelections = {
  ...marketSelections,
  "total-goals": [...marketSelections["total-goals"], ...total15SlipSelections, ...additionalMatchSelections],
  "team-goals": teamSelections,
} as const;
const teamOutcomeMaximumLength = teamSelections.join(",").length;
export const slipMarketOutcomeMaximumLength = (family: SlipMarketFamily) => family === "team-goals" ? teamOutcomeMaximumLength : 256;

export function isSlipMarketFamily(family: unknown): family is SlipMarketFamily {
  return typeof family === "string" && Object.hasOwn(slipMarketSelections, family);
}

export function isTotal15SlipSelection(selection: unknown): selection is Total15SlipSelection {
  return total15SlipSelections.some((outcome) => outcome === selection);
}

export function isSlipMarketSelection(family: unknown, selection: unknown): selection is SlipMarketSelection {
  return isSlipMarketFamily(family) && (slipMarketSelections[family] as readonly unknown[]).includes(selection);
}

export type AdditionalSlipGoalMarket = typeof additionalSlipGoalMarkets[number];
export type AdditionalSlipGoalMarketKey = AdditionalSlipGoalMarket["key"];
const additionalByKey = new Map<string, AdditionalSlipGoalMarket>(additionalSlipGoalMarkets.map((market) => [market.key, market]));
const additionalBySelection = new Map<string, AdditionalSlipGoalMarket>(additionalSlipGoalMarkets.flatMap((market) => [
  [market.over, market] as const, [market.under, market] as const,
]));

export const additionalSlipGoalMarket = (key: string) => additionalByKey.get(key);
export const additionalSlipGoalSelection = (selection: unknown) => typeof selection === "string" ? additionalBySelection.get(selection) : undefined;
export function isSlipGoalExtensionSelection(selection: unknown) {
  return isTotal15SlipSelection(selection) || additionalSlipGoalSelection(selection) !== undefined;
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

export type SlipAdditionalGoalForecast = Readonly<{
  reference: SlipForecastReference;
  markets: readonly Readonly<{
    key: AdditionalSlipGoalMarketKey;
    source: SlipTotal15Forecast["source"];
    probabilities: Readonly<Record<"over" | "under", number>>;
  }>[];
}>;

export function matchesSlipForecast(left: SlipForecastReference, right: SlipForecastReference): boolean {
  return left.cycleId === right.cycleId && left.revisionId === right.revisionId && left.publishedAt === right.publishedAt;
}
