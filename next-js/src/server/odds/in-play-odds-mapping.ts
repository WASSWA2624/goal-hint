import "server-only";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { InPlayOddsBody } from "../../domain/in-play-odds.ts";
import { total15PricesSchema, total15Selections } from "../../domain/extended-markets.ts";
import { bookmakerMarketSchema, bookmakerOddsId, oddsDisplayText } from "../../domain/bookmaker-odds.ts";
import type { NormalizedInPlayOdds, NormalizedInPlayOddsValue } from "../football/api-football-normalize.ts";

/** Independent API-Football in-play IDs. Labels must agree with the live catalog and price response. */
const liveMarkets = {
  "match-result": { id: 59, name: "Fulltime Result", line: null, labels: ["Home", "Draw", "Away"] },
  "double-chance": { id: 72, name: "Double Chance", line: null, labels: ["Home or Draw", "Away or Draw", "Home or Away"] },
  "total-goals": { id: 36, name: "Over/Under Line", line: String(publicPolicy.totalGoalsLine), labels: ["Over", "Under"] },
  "both-teams-to-score": { id: 69, name: "Both Teams to Score", line: null, labels: ["Yes", "No"] },
} as const satisfies Record<MarketFamily, { id: number; name: string; line: string | null; labels: readonly string[] }>;

export function reviewedInPlayCatalog(rows: readonly Readonly<{ id: number; name: string }>[]): Record<string, string> {
  const names = new Map<number, string | null>();
  const safeName = oddsDisplayText(256);
  for (const { id, name } of rows) {
    if (bookmakerOddsId.safeParse(id).success) names.set(id, !names.has(id) && safeName.safeParse(name).success ? name : null);
  }
  return Object.fromEntries([...names].filter((pair): pair is [number, string] => pair[1] !== null));
}

function uniquePrice(prices: readonly NormalizedInPlayOddsValue[]): string | null {
  const main = prices.length === 1 ? prices : prices.filter((price) => price.main);
  return main.length === 1 && !main[0]!.suspended ? main[0]!.odd : null;
}

function inPlayTotal15(row: NormalizedInPlayOdds, catalog: Readonly<Record<string, string>>) {
  const mapping = liveMarkets["total-goals"];
  if (catalog[mapping.id] !== mapping.name) return undefined;
  const bet = row.bets.find(({ id, name }) => id === mapping.id && name === mapping.name);
  if (!bet) return undefined;
  const selections = total15PricesSchema.safeParse(mapping.labels.map((label, index) => ({
    selection: total15Selections[index],
    price: uniquePrice(bet.values.filter((value) => value.label === label && value.handicap === "1.5")),
  })));
  return selections.success ? selections.data : undefined;
}

function displayInPlayMarkets(row: NormalizedInPlayOdds, catalog: Readonly<Record<string, string>>) {
  return [...row.bets].sort((left, right) => left.id - right.id).flatMap((bet) => {
    if (!bet.name || catalog[bet.id] !== bet.name) return [];
    const selections = new Map<string, NormalizedInPlayOddsValue[]>();
    for (const value of bet.values) {
      const key = JSON.stringify([value.label, value.handicap]), group = selections.get(key);
      if (group) group.push(value);
      else selections.set(key, [value]);
    }
    const market = bookmakerMarketSchema.safeParse({ betId: bet.id, name: bet.name,
      selections: [...selections.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .flatMap(([, group]) => {
          const price = uniquePrice(group);
          return price === null ? [] : [{ label: group[0]!.label, line: group[0]!.handicap, price }];
        }),
    });
    return market.success ? [market.data] : [];
  });
}

export function mapInPlayOdds(row: NormalizedInPlayOdds, catalog: Readonly<Record<string, string>>, includeProviderMarkets = false): InPlayOddsBody {
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
  const total15Prices = inPlayTotal15(row, catalog);
  const providerMarkets = includeProviderMarkets ? displayInPlayMarkets(row, catalog) : [];
  return { state: markets.length || total15Prices || providerMarkets.length ? "available" : "unavailable", markets,
    ...(total15Prices ? { total15Prices } : {}), ...(providerMarkets.length ? { providerMarkets } : {}) };
}
