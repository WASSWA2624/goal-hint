import { marketRules, type MarketFamily, type SelectionFor } from "./markets.ts";

export const legacyGoalMarketIdentities = {
  "match-result": { key: "goal:full-time:result", choices: { home: "home-win", draw: "draw", away: "away-win" } },
  "double-chance": { key: "goal:full-time:double-chance", choices: { "home-draw": "home-or-draw", "draw-away": "away-or-draw", "home-away": "home-or-away" } },
  "total-goals": { key: `goal:full-time:totals:total:${marketRules.totalGoalsLine}:binary`, choices: { over: "over-2.5", under: "under-2.5" } },
  "both-teams-to-score": { key: "goal:full-time:btts", choices: { yes: "yes", no: "no" } },
} satisfies { [Family in MarketFamily]: { key: string; choices: Readonly<Record<string, SelectionFor<Family>>> } };

export const legacyFamilyByGoalKey = new Map(Object.entries(legacyGoalMarketIdentities).map(([family, mapping]) => [mapping.key, family as MarketFamily]));
export function legacyForecastMarketKey(family: MarketFamily): string { return legacyGoalMarketIdentities[family].key; }
export function canonicalLegacyForecastSelection(family: MarketFamily, selection: string): string | null {
  return Object.entries(legacyGoalMarketIdentities[family].choices).find(([, key]) => key === selection)?.[0] ?? null;
}
export function legacyForecastOutcome(marketKey: string, selection: string) {
  const family = legacyFamilyByGoalKey.get(marketKey);
  const displayed = family ? Object.entries(legacyGoalMarketIdentities[family].choices).find(([key]) => key === selection)?.[1] : undefined;
  return family && displayed ? { family, selection: displayed } : null;
}
