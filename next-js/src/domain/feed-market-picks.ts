import { total15MarketKey } from "./extended-markets.ts";
import { registeredForecastGoalMarkets } from "./goal-market-definitions.ts";
import { legacyForecastOutcome } from "./legacy-goal-market-identities.ts";
import { marketRegistry, type RegisteredMarketFamily } from "./market-registry.ts";
import { marketSelections, type MarketFamily, type SelectionFor } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";
import type { GoalMarketDefinition } from "./score-distribution-markets.ts";

type LegacyFeedMarketPick = { [Family in MarketFamily]: `${Family}:${SelectionFor<Family>}` }[MarketFamily];
type RegisteredFeedMarketPick = `goal:${string}~${string}`;
export type FeedMarketPick = LegacyFeedMarketPick | `total-goals:${"over" | "under"}-1.5` | RegisteredFeedMarketPick;
export type FeedMarketPickIdentity = Readonly<{ id: FeedMarketPick; family: RegisteredMarketFamily;
  marketKey: string; selection: string; definition: GoalMarketDefinition; legacy?: Readonly<{ family: MarketFamily; selection: string }> }>;

const registry = new Map(registeredForecastGoalMarkets(true).filter(({ family }) => marketRegistry[family].settlement.basis !== "unsupported")
  .map((row) => [row.definition.key, row]));
const canonicalId = (marketKey: string, selection: string) => `${marketKey}~${selection}` as RegisteredFeedMarketPick;

/** URL aliases retain their original identity; the registry supplies the exact period, line, team and outcome. */
export function feedMarketPickIdentity(value: string): FeedMarketPickIdentity | null {
  if (typeof value !== "string") return null;
  const delimiter = value.indexOf("~");
  if (delimiter === -1) return legacyAliases.get(value) ?? null;
  const marketKey = value.slice(0, delimiter), selection = value.slice(delimiter + 1);
  const entry = registry.get(marketKey);
  if (!entry || !entry.definition.selections.some((choice) => choice.key === selection)) return null;
  return identity(entry.family, entry.definition, selection);
}

function identity(family: RegisteredMarketFamily, definition: GoalMarketDefinition, selection: string): FeedMarketPickIdentity {
  const marketKey = definition.key, legacy = legacyForecastOutcome(marketKey, selection);
  const id = legacy ? `${legacy.family}:${legacy.selection}` as LegacyFeedMarketPick
    : marketKey === total15MarketKey && (selection === "over" || selection === "under") ? `total-goals:${selection}-1.5` as const
      : canonicalId(marketKey, selection);
  return { id, family, marketKey, selection, definition, ...(legacy ? { legacy } : {}) };
}
const legacyAliases = new Map<string, FeedMarketPickIdentity>([...registry.values()].flatMap(({ family, definition }) =>
  definition.selections.flatMap(({ key }) => {
    const selection = identity(family, definition, key);
    return selection.id.includes("~") ? [] : [[selection.id, selection] as const];
  })));
const aliasOrder: readonly FeedMarketPick[] = [
  ...publicPolicy.markets.flatMap((family) => marketSelections[family].map((selection) => `${family}:${selection}` as LegacyFeedMarketPick)),
  "total-goals:over-1.5", "total-goals:under-1.5",
];

export function feedMarketPickId(marketKey: string, selection: string): FeedMarketPick | null {
  return feedMarketPickIdentity(canonicalId(marketKey, selection))?.id ?? null;
}
export function canonicalFeedMarketPicks(values: readonly string[]): FeedMarketPick[] | null {
  const picks = new Set<FeedMarketPick>();
  for (const value of values) {
    const identity = feedMarketPickIdentity(value);
    if (!identity || picks.has(identity.id)) return null;
    picks.add(identity.id);
  }
  const aliases = aliasOrder.filter((id) => picks.delete(id));
  return [...aliases, ...[...picks].sort()];
}
