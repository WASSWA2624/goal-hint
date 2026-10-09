import type { ReportingDate } from "./calendar.ts";
import { parseFeedQuery, serializeFeedQuery, type FeedQuery } from "./feed-query.ts";

/** Draft text stays editable; normalization happens once, at submission. */
export function applyFeedDraft(draft: FeedQuery, today: ReportingDate): FeedQuery {
  const parameters = serializeFeedQuery({ ...draft, search: "", page: 1 }, today);
  parameters.set("q", draft.search);
  return parseFeedQuery(parameters, { today, locale: draft.locale });
}

/** Reset filters/order while retaining the reporting selection and page size. */
export function resetFeedFilters(query: FeedQuery): FeedQuery {
  return { ...query, search: "", league: null, status: "all", market: "match-result", sort: { by: "kickoff" }, page: 1 };
}
