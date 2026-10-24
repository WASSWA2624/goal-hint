import type { ReportingDate } from "./calendar.ts";
import { anyProbability, defaultFeedDatePreset, defaultMarkets, defaultSortDirection, parseFeedQuery, parseProbabilityValue, serializeFeedQuery, validProbabilityRange,
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

export type FeedFilterSection = "dates" | "leagues" | "countries" | "markets" | "limits";

/** A dialog reset changes only its own draft fields; applying remains a separate action. */
export function resetFeedFilterSection(draft: FeedQuery, section: FeedFilterSection): FeedQuery {
  switch (section) {
    case "dates": {
      const reset = { ...draft, dates: { kind: defaultFeedDatePreset }, page: 1 };
      delete reset.time;
      return reset;
    }
    case "leagues": return { ...draft, leagues: [], page: 1 };
    case "countries": return { ...draft, countries: [], page: 1 };
    case "markets": return { ...draft, markets: [...defaultMarkets], page: 1 };
    case "limits": return { ...draft, probability: anyProbability, odds: null, page: 1 };
  }
}

/** Reset to the last 30 days and unrestricted filters, retaining the browsing zone, navigation section and page size. */
export function resetFeedFilters(query: FeedQuery): FeedQuery {
  const reset = { ...query };
  delete reset.time;
  return { ...reset, dates: { kind: defaultFeedDatePreset }, search: "", leagues: [], countries: [], markets: [...defaultMarkets], probability: anyProbability, odds: null, picks: "all",
    sort: { by: "kickoff", direction: defaultSortDirection.kickoff }, page: 1 };
}
