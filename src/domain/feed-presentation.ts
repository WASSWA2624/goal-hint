import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { MatchFeedResponse } from "./match-feed.ts";
import type { MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";

/**
 * The shown pick: the highest selected probability among the chosen families, ties in policy
 * order. This mirrors the feed SQL so cards display the pick that ordering and filters used.
 */
export function bestCardFamily(fixture: Pick<FixtureSnapshot, "forecast">, markets: readonly MarketFamily[]): MarketFamily | null {
  let best: { family: MarketFamily; probability: number } | null = null;
  for (const family of publicPolicy.markets) {
    if (!markets.includes(family)) continue;
    const item = fixture.forecast?.markets.find((entry) => entry.market.family === family);
    if (!item) continue;
    const probability = item.market.selectedProbability;
    if (best === null || probability > best.probability) best = { family, probability };
  }
  return best?.family ?? null;
}

export type NoPickReason = "market" | "outside" | "updating" | "unselected" | "closed" | "failed" | "awaiting";

/**
 * Why a fixture shows no pick, from stored cycle/update facts only: no cycle means the fixture was
 * not selected for a prediction run; a failed or expired job surfaces as a delayed update.
 */
export function noPickReason(fixture: Pick<FixtureSnapshot, "forecast" | "cycle" | "update">): NoPickReason {
  if (fixture.forecast) return "market";
  const update = fixture.update?.prediction;
  if (update === "outside-window") return "outside";
  if (update === "updating") return "updating";
  if (!fixture.cycle) return "unselected";
  if (fixture.cycle.state !== "open") return "closed";
  return update === "delayed" ? "failed" : "awaiting";
}

/** List numbering continues across pages. */
export function feedRowNumber(page: number, pageSize: number, index: number): number {
  return (page - 1) * pageSize + index + 1;
}

export type PaginationItem = Readonly<{ kind: "page"; page: number; current: boolean }> | Readonly<{ kind: "gap"; key: string }>;

/**
 * Compact numbered pages: `1 2 3 4 … N` near the start, `1 … N-3 N-2 N-1 N` near the end and
 * `1 … p-1 p p+1 … N` between. At most seven slots, so phones never wrap.
 */
export function paginationItems(current: number, total: number): PaginationItem[] {
  if (!Number.isSafeInteger(total) || total < 1) return [];
  const page = Math.min(Math.max(1, current), total);
  let pages: number[];
  if (total <= 6) pages = Array.from({ length: total }, (_, index) => index + 1);
  else if (page <= 3) pages = [1, 2, 3, 4, total];
  else if (page >= total - 2) pages = [1, total - 3, total - 2, total - 1, total];
  else pages = [1, page - 1, page, page + 1, total];
  const items: PaginationItem[] = [];
  pages.forEach((number, index) => {
    if (index > 0 && number - pages[index - 1]! > 1) items.push({ kind: "gap", key: `gap-${pages[index - 1]}` });
    items.push({ kind: "page", page: number, current: number === current });
  });
  return items;
}

export type FilterOption = Readonly<{ value: string; label: string; detail: string | null; logoUrl: string | null; fixtures: number }>;

/** Leagues in the date cohort, most fixtures first, then name. */
export function leagueOptions(leagues: MatchFeedResponse["leagues"], unknownLabel: string): FilterOption[] {
  return leagues.map((league) => ({ value: league.id, label: league.name ?? unknownLabel, detail: league.country,
    logoUrl: league.logoUrl, fixtures: league.fixtures }))
    .sort((a, b) => b.fixtures - a.fixtures || a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
}

/** Distinct competition countries in the date cohort with combined fixture counts. */
export function countryOptions(leagues: MatchFeedResponse["leagues"]): FilterOption[] {
  const totals = new Map<string, number>();
  for (const league of leagues) if (league.country) totals.set(league.country, (totals.get(league.country) ?? 0) + league.fixtures);
  return [...totals].map(([country, fixtures]) => ({ value: country, label: country, detail: null, logoUrl: null, fixtures }))
    .sort((a, b) => b.fixtures - a.fixtures || a.label.localeCompare(b.label));
}
