import type { ReportingDate } from "./calendar.ts";
import { anyProbability, defaultMarkets, parseFeedQuery, serializeFeedQuery, type FeedQuery } from "./feed-query.ts";

/** Draft text stays editable; normalization happens once, at submission. */
export function applyFeedDraft(draft: FeedQuery, today: ReportingDate): FeedQuery {
  const parameters = serializeFeedQuery({ ...draft, search: "", page: 1 }, today);
  parameters.set("q", draft.search);
  return parseFeedQuery(parameters, { today, locale: draft.locale });
}

/** Reset filters/order while retaining the reporting selection, status entry and page size. */
export function resetFeedFilters(query: FeedQuery): FeedQuery {
  return { ...query, search: "", leagues: [], countries: [], markets: [...defaultMarkets], probability: anyProbability, picks: "all",
    sort: { by: "kickoff", direction: "asc" }, page: 1 };
}
