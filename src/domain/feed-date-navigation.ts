import { addReportingDays, CalendarValidationError, type ReportingDate } from "./calendar.ts";
import { feedQueryHref, resolveFeedDates, type DateSelection, type FeedQuery } from "./feed-query.ts";

/** Date links retain the applied query but restart its page position. */
export function feedDateNavigation(query: FeedQuery, today: ReportingDate) {
  const range = resolveFeedDates(query, today);
  const href = (dates: DateSelection) => feedQueryHref({ ...query, dates, page: 1 }, today);
  const adjacent = (date: ReportingDate, offset: number) => {
    try {
      const target = addReportingDays(date, offset);
      return target < "1000-01-01" ? null : { date: target, href: href({ kind: "date", date: target }) };
    } catch (error) { if (error instanceof CalendarValidationError) return null; throw error; }
  };
  return {
    presets: (["today", "tomorrow", "next-7-days"] as const).map((kind) => {
      const dates = resolveFeedDates({ dates: { kind } }, today);
      return { kind, href: href({ kind }), current: range.startDate === dates.startDate && range.endDate === dates.endDate };
    }),
    previous: adjacent(range.startDate, -1), next: adjacent(range.endDate, 1),
  };
}
