import { marketSelections, type MarketFamily, type SelectionFor } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";

type LegacyFeedMarketPick = { [Family in MarketFamily]: `${Family}:${SelectionFor<Family>}` }[MarketFamily];

/** A catalog of selectable published outcomes. It stays stable across date and league filters. */
export const feedMarketPickOptions = [
  ...publicPolicy.markets.flatMap(family => marketSelections[family].map(selection => ({
    kind: "legacy" as const, family, selection, id: `${family}:${selection}` as LegacyFeedMarketPick,
  }))),
  ...(["over", "under"] as const).map(selection => ({
    kind: "extended" as const, family: "total-goals" as const, selection, id: `total-goals:${selection}-1.5` as const,
  })),
] as const;

export type FeedMarketPick = typeof feedMarketPickOptions[number]["id"];

export function canonicalFeedMarketPicks(values: readonly string[]): FeedMarketPick[] | null {
  const picks = feedMarketPickOptions.map(({ id }) => id).filter(id => values.includes(id));
  return values.length === picks.length ? picks : null;
}
