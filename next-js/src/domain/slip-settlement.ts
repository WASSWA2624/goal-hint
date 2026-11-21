import { goalTotalsMarket } from "./goal-market-definitions.ts";
import { settleMarketSelection, type SettlementContext } from "./market-settlement.ts";
import { settleGoalSelection } from "./score-distribution-markets.ts";
import { additionalSlipGoalMarkets, additionalSlipGoalSelection, isTotal15SlipSelection, total15Direction } from "./slip-markets.ts";

export const slipTotal15Market = goalTotalsMarket(1.5);
const additionalDefinitions = new Map(additionalSlipGoalMarkets.map(({ key, line, metric }) => [key, goalTotalsMarket(line, metric)]));

export function settleSlipSelection(family: unknown, selection: unknown, context: SettlementContext) {
  const additional = additionalSlipGoalSelection(selection);
  const definition = additional && additional.family === family ? additionalDefinitions.get(additional.key) : undefined;
  if (additional && definition) {
    return settleGoalSelection(definition, selection === additional.over ? "over" : "under", { ...context, halfTimeScore: null });
  }
  return family === "total-goals" && isTotal15SlipSelection(selection)
    ? settleGoalSelection(slipTotal15Market, total15Direction(selection), { ...context, halfTimeScore: null })
    : settleMarketSelection(family, selection, context);
}
