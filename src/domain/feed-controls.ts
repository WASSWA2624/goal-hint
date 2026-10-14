import type { ReportingDate } from "./calendar.ts";
import { anyProbability, defaultMarkets, parseFeedQuery, parseProbabilityValue, serializeFeedQuery, validProbabilityRange,
  type FeedQuery, type ProbabilityRange } from "./feed-query.ts";

/** Draft text stays editable; normalization happens once, at submission. */
export function applyFeedDraft(draft: FeedQuery, today: ReportingDate): FeedQuery {
  const parameters = serializeFeedQuery({ ...draft, search: "", page: 1 }, today);
  parameters.set("q", draft.search);
  return parseFeedQuery(parameters, { today, locale: draft.locale });
}

/** Blank probability endpoints mean Any; incomplete numeric drafts remain invalid. */
export function parseProbabilityInputs(values: { min: string; max: string }): ProbabilityRange | null {
  const min = values.min === "" ? anyProbability.min : parseProbabilityValue(values.min);
  const max = values.max === "" ? anyProbability.max : parseProbabilityValue(values.max);
  return min !== null && max !== null && validProbabilityRange({ min, max }) ? { min, max } : null;
}

/** Reset to Today and unrestricted filters, retaining the browsing zone, navigation section and page size. */
export function resetFeedFilters(query: FeedQuery): FeedQuery {
  const reset = { ...query };
  delete reset.time;
  return { ...reset, dates: { kind: "today" }, search: "", leagues: [], countries: [], markets: [...defaultMarkets], probability: anyProbability, odds: null, picks: "all",
    sort: { by: "kickoff", direction: "asc" }, page: 1 };
}
