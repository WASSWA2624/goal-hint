import { marketRules, validateMarketSnapshot, type MarketSnapshot } from "./markets.ts";
import { goalBothTeamsScoreMarket, goalResultMarket, goalTotalsMarket } from "./goal-market-definitions.ts";
import { deriveGoalMarket } from "./score-distribution-markets.ts";

/** Keeps v1 family keys, event semantics and validation unchanged while deriving them from one new-model joint distribution. */
export function legacyMarketsFromScoreDistribution(distribution: unknown): MarketSnapshot {
  const groups: Record<string, unknown> = {};
  for (const [family, definition, keys] of [
    ["match-result", goalResultMarket(), { home: "home-win", draw: "draw", away: "away-win" }],
    ["total-goals", goalTotalsMarket(2.5), { over: "over-2.5", under: "under-2.5" }],
    ["both-teams-to-score", goalBothTeamsScoreMarket(), { yes: "yes", no: "no" }],
  ] as const) {
    const derived = deriveGoalMarket(distribution, definition);
    if (!derived.available) continue;
    const probabilities = Object.fromEntries(derived.market.selections.map((selection) =>
      [(keys as Readonly<Record<string, string>>)[selection.key]!, selection.winProbability]));
    groups[family] = { source: "ai", period: marketRules.period, probabilities, ...(family === "total-goals" ? { line: 2.5 } : {}) };
  }
  return validateMarketSnapshot(groups);
}
