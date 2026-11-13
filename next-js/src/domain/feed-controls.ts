import type { ReportingDate } from "./calendar.ts";
import { anyProbability, defaultFeedDatePreset, defaultMarkets, matchFeedPageDefaults, parseFeedQuery, parseProbabilityValue, resolveFeedDates, serializeFeedQuery, validProbabilityRange,
  type DateSelection, type FeedDatePreset, type FeedQuery, type FeedStatus, type ProbabilityRange } from "./feed-query.ts";
import { publicPolicy } from "./public-policy.ts";

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
    const changed = range.startDate !== today || range.endDate !== today || !!query.time || !!query.interval;
    if (query.dates.kind === "today" && !query.time && !query.interval) return query;
    const synchronized = { ...query, dates: { kind: "today" as const }, page: changed ? 1 : query.page };
    delete synchronized.time;
    delete synchronized.interval;
    return synchronized;
  }
  if (query.status === "scheduled" && range.endDate < today) {
    return { ...query, interval: undefined, dates: { kind: "next-30-days" }, page: 1 };
  }
  if (query.status === "finished" && range.startDate > today) {
    return { ...query, interval: undefined, dates: { kind: defaultFeedDatePreset }, page: 1 };
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
  const { result: _result, ...scope } = query; void _result;
  return synchronizeFeedStatusDates({ ...scope, ...(dates !== query.dates ? { interval: undefined } : {}), summary: undefined, status, dates, page: 1 }, today);
}

/** An explicit period can leave Live. Historical dates clear the legacy above-75 preset. */
export function selectFeedDateScope(query: FeedQuery, today: ReportingDate): FeedQuery {
  const range = resolveFeedDates(query, today);
  const includesHistory = range.startDate < today;
  const conflictsWithLive = query.status === "live" && (range.startDate !== today || range.endDate !== today);
  const conflictsWithUpcoming = query.status === "scheduled" && range.endDate < today;
  if (!includesHistory && !conflictsWithLive) return query;
  return { ...query,
    probability: includesHistory && query.probability.minExclusive ? anyProbability : query.probability,
    status: conflictsWithLive || conflictsWithUpcoming ? "all" : query.status };
}

export function selectFeedDates(query: FeedQuery, dates: DateSelection, today: ReportingDate): FeedQuery {
  return synchronizeFeedStatusDates(selectFeedDateScope({ ...query, summary: undefined, interval: undefined, dates, page: 1 }, today), today);
}

/** Draft text stays editable; normalization happens once, at submission. */
export function applyFeedDraft(draft: FeedQuery, today: ReportingDate, providerOdds = publicPolicy.features.providerOdds): FeedQuery {
  const parameters = serializeFeedQuery({ ...draft, summary: undefined, search: "", page: 1 }, today);
  parameters.set("q", draft.search);
  return synchronizeFeedStatusDates(parseFeedQuery(parameters, { today, locale: draft.locale, providerOdds }), today);
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
      const reset = { ...draft, interval: undefined, dates: matchFeedPageDefaults.dates, page: 1 };
      delete reset.time;
      return reset;
    }
    case "leagues": return { ...draft, leagues: [], page: 1 };
    case "countries": return { ...draft, countries: [], page: 1 };
    case "markets": {
      const reset = { ...draft, markets: [...defaultMarkets], page: 1 };
      delete reset.marketPicks;
      return reset;
    }
    case "limits": return { ...draft, probability: anyProbability, odds: null, page: 1 };
  }
}

/** Restore every page filter and fifty-item limit, retaining the browsing zone. */
export function resetFeedFilters(query: FeedQuery): FeedQuery {
  const reset = { ...query };
  delete reset.time; delete reset.result; delete reset.summary; delete reset.marketPicks;
  delete reset.interval;
  return { ...reset, ...matchFeedPageDefaults, status: "all", search: "", leagues: [], countries: [], markets: [...defaultMarkets],
    odds: null, page: 1 };
}
