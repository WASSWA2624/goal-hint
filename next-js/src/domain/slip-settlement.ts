import { goalTotalsMarket } from "./goal-market-definitions.ts";
import { settleMarketSelection, type SettlementContext } from "./market-settlement.ts";
import { settleGoalSelection } from "./score-distribution-markets.ts";
import { isTotal15SlipSelection, total15Direction } from "./slip-markets.ts";

export const slipTotal15Market = goalTotalsMarket(1.5);

export function settleSlipSelection(family: unknown, selection: unknown, context: SettlementContext) {
  return family === "total-goals" && isTotal15SlipSelection(selection)
    ? settleGoalSelection(slipTotal15Market, total15Direction(selection), { ...context, halfTimeScore: null })
    : settleMarketSelection(family, selection, context);
}
