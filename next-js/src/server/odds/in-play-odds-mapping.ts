import "server-only";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { InPlayOddsBody } from "../../domain/in-play-odds.ts";
import type { NormalizedInPlayOdds, NormalizedInPlayOddsValue } from "../football/api-football-normalize.ts";

/** Independent API-Football in-play IDs. Labels must agree with the live catalog and price response. */
const liveMarkets = {
  "match-result": { id: 59, name: "Fulltime Result", line: null, labels: ["Home", "Draw", "Away"] },
  "double-chance": { id: 72, name: "Double Chance", line: null, labels: ["Home or Draw", "Away or Draw", "Home or Away"] },
  "total-goals": { id: 36, name: "Over/Under Line", line: String(publicPolicy.totalGoalsLine), labels: ["Over", "Under"] },
  "both-teams-to-score": { id: 69, name: "Both Teams to Score", line: null, labels: ["Yes", "No"] },
} as const satisfies Record<MarketFamily, { id: number; name: string; line: string | null; labels: readonly string[] }>;

export function reviewedInPlayCatalog(rows: readonly Readonly<{ id: number; name: string }>[]): Record<string, string> {
  const verified: Record<string, string> = {};
  for (const { id, name } of Object.values(liveMarkets)) if (rows.some((row) => row.id === id && row.name === name)) verified[id] = name;
  return verified;
}

function uniquePrice(prices: readonly NormalizedInPlayOddsValue[]): string | null {
  const main = prices.length === 1 ? prices : prices.filter((price) => price.main);
  return main.length === 1 && !main[0]!.suspended ? main[0]!.odd : null;
}

export function mapInPlayOdds(row: NormalizedInPlayOdds, catalog: Readonly<Record<string, string>>): InPlayOddsBody {
  if (row.finished) return { state: "unavailable", markets: [] };
  if (row.blocked || row.stopped) return { state: "suspended", markets: [] };
  const markets = publicPolicy.markets.flatMap((family) => {
    const mapping = liveMarkets[family];
    if (catalog[mapping.id] !== mapping.name) return [];
    const bet = row.bets.find(({ id, name }) => id === mapping.id && name === mapping.name);
    if (!bet) return [];
    const selections = marketSelections[family].map((selection, index) => ({ selection, price: uniquePrice(bet.values.filter((value) =>
      value.label === mapping.labels[index] && value.handicap === mapping.line)) }));
    return selections.every((entry): entry is { selection: typeof selections[number]["selection"]; price: string } => entry.price !== null)
      ? [{ family, selections }] : [];
  });
  return { state: markets.length ? "available" : "unavailable", markets };
}
