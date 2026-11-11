import { parseReportingDate, type ReportingDate } from "./calendar.ts";
import { dateTimeIntervalRange, localDateTimeValue, type DateTimeInterval } from "./date-time.ts";
import { applyFeedDraft, parseProbabilityInputs, selectFeedDateScope } from "./feed-controls.ts";
import { feedQueryRules, formatProbabilityValue, parseProbabilityValue, resolveFeedDates, type FeedQuery } from "./feed-query.ts";
import { parseLocalDateTime } from "./date-time.ts";
import { kickoffTimeWindows } from "./kickoff-time.ts";

export type FeedFilterDraft = Readonly<{
  query: FeedQuery; dateTimes: DateTimeInterval; zone: string; probability: Readonly<{ min: string; max: string }>;
  probabilityEdited?: boolean;
}>;

/** Cross-field issues stay separate from incomplete editor text, which belongs to the date input itself. */
export function feedFilterDraftIssues(draft: FeedFilterDraft) {
  let range: "order" | "maximum" | null = null;
  try {
    const from = parseLocalDateTime(draft.dateTimes.from), to = parseLocalDateTime(draft.dateTimes.to);
    if (from > to) range = "order";
    else if ((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000 + 1 > feedQueryRules.maximumDays) range = "maximum";
  } catch { /* Partial values are validated beside the editor on blur, not in a form-wide banner. */ }
  const min = draft.probability.min === "" ? 0 : parseProbabilityValue(draft.probability.min);
  const max = draft.probability.max === "" ? 100 : parseProbabilityValue(draft.probability.max);
  return { range, minInvalid: min === null, maxInvalid: max === null, probabilityOrder: min !== null && max !== null && min > max };
}

/** Prefill applied instants in the device zone, including shared links created in another zone. */
export function feedFilterDraft(query: FeedQuery, today: ReportingDate, zone: string): FeedFilterDraft {
  const range = resolveFeedDates(query, today);
  const windows = query.time ? kickoffTimeWindows(range, query.time) : [];
  const first = windows[0]?.start ?? range.window.startInclusive, last = windows.at(-1)?.end ?? range.window.endExclusive;
  return { query, zone, dateTimes: { from: localDateTimeValue(first, zone), to: localDateTimeValue(last - 60_000, zone) },
    probability: { min: query.probability.min === 0 ? "" : formatProbabilityValue(query.probability.min),
      max: query.probability.max === 100 ? "" : formatProbabilityValue(query.probability.max) } };
}

/** Unedited legacy links retain their scope; editing either endpoint creates one continuous interval. */
export function compileFeedFilterDraft(draft: FeedFilterDraft, today: ReportingDate): FeedQuery | null {
  try {
    const parsed = parseProbabilityInputs(draft.probability);
    if (!parsed) return null;
    const original = feedFilterDraft(draft.query, today, draft.zone);
    const probability = !draft.probabilityEdited && draft.probability.min === original.probability.min &&
      draft.probability.max === original.probability.max ? draft.query.probability : parsed;
    if (original.dateTimes.from === draft.dateTimes.from && original.dateTimes.to === draft.dateTimes.to) {
      return applyFeedDraft({ ...draft.query, probability, page: 1 }, today);
    }
    const range = dateTimeIntervalRange(draft.dateTimes, draft.zone);
    const dates: FeedQuery["dates"] = range.startDate === range.endDate ? { kind: "date", date: parseReportingDate(range.startDate) }
      : { kind: "range", from: range.startDate, to: range.endDate };
    return applyFeedDraft(selectFeedDateScope({ ...draft.query, summary: undefined, time: null, interval: draft.dateTimes, zone: draft.zone, dates, probability, page: 1 }, today), today);
  } catch { return null; }
}
