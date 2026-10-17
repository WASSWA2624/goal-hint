import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { MatchFeedResponse } from "./match-feed.ts";
import type { MarketFamily } from "./markets.ts";
import { bestPublishedFamily } from "./market-ranking.ts";
import { countryFlagAsset } from "./country-flag.ts";
import type { ReportingDate } from "./calendar.ts";
import { resolveFeedDates, type FeedQuery } from "./feed-query.ts";
import type { createMessages } from "../i18n/messages.ts";

/**
 * The shown pick mirrors feed SQL: highest unrounded probability, then exact fresh public odds,
 * then policy order. Ordering and filters therefore refer to the pick the card actually shows.
 */
export function bestCardFamily(fixture: Pick<FixtureSnapshot, "forecast" | "prices">, markets: readonly MarketFamily[]): MarketFamily | null {
  return bestPublishedFamily(fixture.forecast?.markets, fixture.prices ?? [], markets);
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

export type PaginationWindow = Readonly<{ from: number; to: number }>;

/**
 * Inclusive pages to mount around a scrolling strip's viewport, without allocating every page.
 * Empty/invalid totals return 0–0; other inputs become bounded integers. At the end of the strip,
 * keep a full viewport before adding overscan so the final pages stay reachable.
 */
export function paginationWindow(totalPages: number, firstVisiblePage: number, visiblePages: number, overscan = 8): PaginationWindow {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) return { from: 0, to: 0 };
  const bounded = (value: number, fallback: number, minimum: number) =>
    Math.min(totalPages, Math.max(minimum, Number.isFinite(value) ? Math.trunc(value) : fallback));
  const visible = bounded(visiblePages, 1, 1), extra = bounded(overscan, 8, 0);
  const first = Math.min(bounded(firstVisiblePage, 1, 1), totalPages - visible + 1);
  const last = first + visible - 1;
  return { from: Math.max(1, first - extra), to: last + Math.min(extra, totalPages - last) };
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
  return [...totals].map(([country, fixtures]) => ({ value: country, label: country, detail: null, logoUrl: countryFlagAsset(country), fixtures }))
    .sort((a, b) => b.fixtures - a.fixtures || a.label.localeCompare(b.label));
}

/** The feed's one H1: live/results views, today/tomorrow, a named single day, else the generic collection. */
export function feedHeading(query: FeedQuery, today: ReportingDate, messages: ReturnType<typeof createMessages>) {
  const range = resolveFeedDates(query, today);
  if (query.status === "live") return messages.text("feed.heading.live");
  if (query.status === "finished") return messages.text("feed.heading.results");
  if (range.dayCount === 1 && range.startDate === today) return messages.text("feed.heading.today");
  if (query.dates.kind === "tomorrow") return messages.text("feed.heading.tomorrow");
  // A single archived or upcoming day names its date, matching the page title's topic.
  if (range.dayCount === 1) return messages.text("feed.heading.dated", { date: messages.reportingDateMedium(range.startDate) });
  return messages.text("feed.heading.other");
}
