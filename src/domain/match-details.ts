import type { InsightResult } from "./match-insights.ts";
import type { MarketCategory } from "./match-view.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import { marketSelections, type MarketFamily, type MarketSelection } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";

/**
 * Pure presentation rules for the match-details screen. Every value is read from the stored
 * applicable revision or stored results; nothing is estimated here.
 */

/** Categories each supported market belongs to; "popular" lists every published family. */
export const marketCategoryMembers: Readonly<Record<MarketCategory, readonly MarketFamily[]>> = Object.freeze({
  popular: publicPolicy.markets,
  results: ["match-result"],
  goals: ["total-goals", "both-teams-to-score"],
  btts: ["both-teams-to-score"],
  "double-chance": ["double-chance"],
  "draw-no-bet": [],
  handicaps: [],
  corners: [],
  cards: [],
  halves: [],
  "correct-score": [],
  "clean-sheets": [],
  specials: [],
});

/** The market row for one family in the applicable revision, or why it is missing. */
export function marketRow(data: MatchDetailResponse, family: MarketFamily) {
  const snapshot = data.snapshot;
  const item = snapshot?.markets.find((entry) => entry.market.family === family) ?? null;
  const reason = (snapshot?.unavailableMarkets ?? data.fixture.unavailableMarkets ?? []).find((entry) => entry.family === family)?.reason ?? "not-published";
  const outcome = item && snapshot ? snapshot.outcomes.find((entry) => entry.family === family && entry.selection === item.market.selection &&
    entry.revisionId === snapshot.revisionId && entry.cycleId === snapshot.cycleId) ?? null : null;
  return { family, item, outcome, reason };
}

/** The featured pick: the highest selected probability across published families, ties in policy order. */
export function featuredFamily(data: MatchDetailResponse): MarketFamily | null {
  let best: { family: MarketFamily; probability: number } | null = null;
  for (const family of publicPolicy.markets) {
    const item = data.snapshot?.markets.find((entry) => entry.market.family === family);
    if (item && (best === null || item.market.selectedProbability > best.probability)) best = { family, probability: item.market.selectedProbability };
  }
  return best?.family ?? null;
}

/** Families visible for a category and search text; search spans every category. */
export function visibleMarkets(category: MarketCategory, search: string, label: (family: MarketFamily) => string): MarketFamily[] {
  const needle = search.normalize("NFC").trim().toLocaleLowerCase();
  if (!needle) return [...marketCategoryMembers[category]];
  return publicPolicy.markets.filter((family) => label(family).toLocaleLowerCase().includes(needle));
}

/** Every outcome of a family in its canonical order with its stored probability. */
export function marketOutcomes(probabilities: Readonly<Record<string, number>>, family: MarketFamily) {
  return (marketSelections[family] as readonly MarketSelection[]).map((selection) => ({ selection, probability: probabilities[selection] ?? null }));
}

/** Mutually exclusive families must sum to one within the market tolerance; double chance overlaps by definition. */
export function exclusiveFamily(family: MarketFamily): boolean {
  return family !== "double-chance";
}

export type FormLetter = "W" | "D" | "L";
/** Chronological (oldest first) W/D/L letters for a team, from newest-first records. */
export function formLetters(records: readonly InsightResult[], teamId: string, count: number): FormLetter[] {
  return records.slice(0, count).map((record) => {
    const home = record.home.id === teamId;
    const scored = home ? record.homeGoals : record.awayGoals, conceded = home ? record.awayGoals : record.homeGoals;
    return scored > conceded ? "W" : scored < conceded ? "L" : "D";
  }).reverse();
}

/** Goals scored and conceded over newest-first records, and the scored series oldest first for a sparkline. */
export function goalTotals(records: readonly InsightResult[], teamId: string) {
  let scored = 0, conceded = 0;
  const series: number[] = [];
  for (const record of records) {
    const home = record.home.id === teamId;
    const goals = home ? record.homeGoals : record.awayGoals;
    scored += goals; conceded += home ? record.awayGoals : record.homeGoals;
    series.unshift(goals);
  }
  return { scored, conceded, series };
}

/** Stable key for a player within this match: side plus provider player id. */
export function playerKey(team: "home" | "away", id: number): string {
  return `${team}-${id}`;
}
export function parsePlayerKey(value: string | null): { team: "home" | "away"; id: number } | null {
  const match = value?.match(/^(home|away)-([1-9]\d{0,9})$/u);
  return match ? { team: match[1] as "home" | "away", id: Number(match[2]) } : null;
}

/** Position groups for player filters, from provider position codes or names. */
export type PositionGroup = "G" | "D" | "M" | "F";
export function positionGroup(position: string | null): PositionGroup | null {
  const value = position?.trim().toUpperCase() ?? "";
  if (!value) return null;
  if (value === "G" || value.startsWith("GOAL")) return "G";
  if (value === "D" || value.startsWith("DEF")) return "D";
  if (value === "M" || value.startsWith("MID")) return "M";
  if (value === "F" || value.startsWith("ATT") || value.startsWith("FOR")) return "F";
  return null;
}

/** Players arranged by the provider formation grid "row:column"; rows run from goalkeeper forward. */
export function pitchRows<T extends { grid: string | null }>(players: readonly T[]): T[][] | null {
  const placed = players.map((player) => ({ player, cell: player.grid?.match(/^(\d{1,2}):(\d{1,2})$/u) ?? null }));
  if (placed.length === 0 || placed.some((entry) => entry.cell === null)) return null;
  const rows = new Map<number, { column: number; player: T }[]>();
  for (const { player, cell } of placed) {
    const row = Number(cell![1]), column = Number(cell![2]);
    rows.set(row, [...(rows.get(row) ?? []), { column, player }]);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, entries]) => entries.sort((a, b) => a.column - b.column).map((entry) => entry.player));
}
