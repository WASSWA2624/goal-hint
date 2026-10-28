import type { MarketFamily } from "./markets.ts";

const teamNames: Readonly<Record<string, string>> = {
  "Inter Milan": "Inter",
  "Sporting CP": "Sporting",
  "Wolverhampton Wanderers": "Wolves",
  "Brighton & Hove Albion": "Brighton",
  "Borussia Mönchengladbach": "M'gladbach",
  "1. FC Heidenheim 1846": "Heidenheim",
  "Club Athletico Paranaense": "Athletico PR",
  "Red Bull Bragantino": "Bragantino",
};

const leagueNames: Readonly<Record<string, string>> = {
  "Premier League": "EPL",
  "English Premier League": "EPL",
  "Serie A": "Serie A",
  "Primeira Liga": "Liga PT",
  "UEFA Champions League": "UCL",
  "UEFA Europa League": "UEL",
  "UEFA Conference League": "UECL",
  "Major League Soccer": "MLS",
};

const marketNames: Readonly<Record<MarketFamily, string>> = {
  "match-result": "1X2",
  "double-chance": "DC",
  "total-goals": "O/U",
  "both-teams-to-score": "BTTS",
};

/** Familiar visible labels only; callers retain the complete name for accessible descriptions and titles. */
export function compactTeamName(name: string): string {
  const full = name.trim();
  return Object.hasOwn(teamNames, full) ? teamNames[full]! : full;
}

/** Unknown leagues retain their own name and can be ellipsized by the containing layout. */
export function compactLeagueName(name: string): string {
  const full = name.trim();
  return Object.hasOwn(leagueNames, full) ? leagueNames[full]! : full;
}

export function compactMarketName(family: MarketFamily): string {
  return marketNames[family];
}
