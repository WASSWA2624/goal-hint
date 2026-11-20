import "server-only";

import { localFirstGoalMarketDefinitions, registeredForecastGoalMarkets } from "../../domain/goal-market-definitions.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { compareForecastPicks } from "../../domain/recommendation.ts";
import { deriveLocalGoalMarket } from "../../domain/score-distribution-markets.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey } from "../predictions/forecast-market-evaluator.ts";
import type { LocalGoalForecast } from "./intelligence-contract.ts";
import { localGoalModelVersion } from "./local-goals-model.ts";

const launchFamilies = Object.keys(marketSelections) as MarketFamily[];
const legacy = new Map(launchFamilies.map((family) => [legacyForecastMarketKey(family), family]));
const replayDefinitions = registeredForecastGoalMarkets(true).filter(({ definition }) =>
  legacy.has(definition.key) || localFirstGoalMarketDefinitions.some(({ key }) => definition.key === key));

/** Use the approved prospective formulas without creating a backdated prospective publication. */
export function buildNovemberReplayMarkets(forecast: LocalGoalForecast) {
  if (forecast.modelVersion !== localGoalModelVersion() || forecast.status !== "estimated" || !forecast.expectedGoals || !forecast.probabilities) return null;
  const { expectedGoals, probabilities } = forecast;
  const markets = replayDefinitions.map(({ definition }) => {
    const legacyFamily = legacy.get(definition.key);
    const selections = legacyFamily ? definition.selections.map(({ key }) => {
      const entry = marketSelections[legacyFamily].find((selection) => canonicalLegacyForecastSelection(legacyFamily, selection) === key);
      if (!entry) throw new Error("The registered market and its launch selection differ.");
      const win = (probabilities[legacyFamily] as Readonly<Record<string, number>>)[entry]!;
      return { key, outcomes: { win, loss: 1 - win, push: 0, "half-win": 0, "half-loss": 0 } };
    }) : (() => {
      const result = deriveLocalGoalMarket(expectedGoals, definition, "outright-win");
      if (!result.available) throw new Error("A replay definition has lost its approved model.");
      return result.market.selections.map(({ key, outcomes }) => ({ key, outcomes }));
    })();
    const selected = selections.map(({ key: selection, outcomes }) => ({ key: definition.key, selection, probability: outcomes.win, odds: null }))
      .sort(compareForecastPicks)[0]!;
    return { definition, selections, selected: { selection: selected.selection, probability: selected.probability } };
  });
  const best = markets.map(({ definition, selected }) => ({ key: definition.key, ...selected, odds: null })).sort(compareForecastPicks)[0]!;
  return { markets, selected: { marketKey: best.key, selection: best.selection, probability: best.probability } };
}
