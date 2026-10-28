import type { ReportingDate } from "./calendar.ts";
import { anyProbability, defaultFeedDatePreset, defaultMarkets, defaultPagePicks, defaultSortDirection, parseFeedQuery, parseProbabilityValue, resolveFeedDates, serializeFeedQuery, validProbabilityRange,
  type DateSelection, type FeedDatePreset, type FeedQuery, type FeedStatus, type ProbabilityRange } from "./feed-query.ts";

const upcomingPeriods: Partial<Record<FeedDatePreset, FeedDatePreset>> = {
  "last-30-days": "next-30-days", "last-7-days": "next-7-days", "last-3-days": "next-3-days", yesterday: "today",
};
const completedPeriods: Partial<Record<FeedDatePreset, FeedDatePreset>> = {
  "next-30-days": "last-30-days", "next-7-days": "last-7-days", "next-3-days": "last-3-days", tomorrow: "today",
};

/** Page controls coordinate status and dates; the low-level parser still supports historical API reads. */
export function synchronizeFeedStatusDates(query: FeedQuery, today: ReportingDate): FeedQuery {
  const range = resolveFeedDates(query, today);
  if (query.status === "live") {
    const changed = range.startDate !== today || range.endDate !== today || !!query.time;
    if (query.dates.kind === "today" && !query.time) return query;
    const synchronized = { ...query, dates: { kind: "today" as const }, page: changed ? 1 : query.page };
    delete synchronized.time;
    return synchronized;
  }
  if (query.status === "scheduled" && range.endDate < today) {
    return { ...query, dates: { kind: "next-30-days" }, page: 1 };
  }
  if (query.status === "finished" && range.startDate > today) {
    return { ...query, dates: { kind: defaultFeedDatePreset }, page: 1 };
  }
  return query;
}

/** Changing status restarts pagination and retains compatible filter choices. */
export function selectFeedStatus(query: FeedQuery, status: FeedStatus, today: ReportingDate): FeedQuery {
  let dates = query.dates;
  if (dates.kind !== "date" && dates.kind !== "range") {
    const period = status === "scheduled" ? upcomingPeriods[dates.kind] : status === "finished" ? completedPeriods[dates.kind] : undefined;
    if (period) dates = { kind: period };
  }
  return synchronizeFeedStatusDates({ ...query, status, dates, page: 1 }, today);
}

/** Live stays on Today until the visitor chooses another status. */
export function selectFeedDates(query: FeedQuery, dates: DateSelection, today: ReportingDate): FeedQuery {
  return synchronizeFeedStatusDates({ ...query, dates, page: 1 }, today);
}

/** Draft text stays editable; normalization happens once, at submission. */
export function applyFeedDraft(draft: FeedQuery, today: ReportingDate): FeedQuery {
  const parameters = serializeFeedQuery({ ...draft, search: "", page: 1 }, today);
  parameters.set("q", draft.search);
  return synchronizeFeedStatusDates(parseFeedQuery(parameters, { today, locale: draft.locale }), today);
}

/** Blank probability endpoints mean Any; incomplete numeric drafts remain invalid. */
export function parseProbabilityInputs(values: { min: string; max: string }): ProbabilityRange | null {
  const min = values.min === "" ? anyProbability.min : parseProbabilityValue(values.min);
  const max = values.max === "" ? anyProbability.max : parseProbabilityValue(values.max);
  return min !== null && max !== null && validProbabilityRange({ min, max }) ? { min, max } : null;
}

export type FeedFilterSection = "dates" | "leagues" | "countries" | "markets" | "limits";

/** A dialog reset changes only its own draft fields; applying remains a separate action. */
export function resetFeedFilterSection(draft: FeedQuery, section: FeedFilterSection): FeedQuery {
  switch (section) {
    case "dates": {
      const kind = draft.status === "live" ? "today" : draft.status === "scheduled" ? "next-30-days" : defaultFeedDatePreset;
      const reset = { ...draft, dates: { kind }, page: 1 };
      delete reset.time;
      return reset;
    }
    case "leagues": return { ...draft, leagues: [], page: 1 };
    case "countries": return { ...draft, countries: [], page: 1 };
    case "markets": return { ...draft, markets: [...defaultMarkets], page: 1 };
    case "limits": return { ...draft, probability: anyProbability, odds: null, page: 1 };
  }
}

/** Restore every filter, retaining the browsing zone and page size. */
export function resetFeedFilters(query: FeedQuery, subscriberOnly = false): FeedQuery {
  const reset = { ...query };
  delete reset.time;
  return { ...reset, status: "all", dates: { kind: defaultFeedDatePreset }, search: "", leagues: [], countries: [], markets: [...defaultMarkets], probability: anyProbability, odds: null,
    picks: defaultPagePicks("all", subscriberOnly),
    sort: { by: "kickoff", direction: defaultSortDirection.kickoff }, page: 1 };
}
