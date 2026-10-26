import { addReportingDays, CalendarValidationError, type ReportingDate, type ReportingDateRange } from "./calendar.ts";
import { feedDatePresets, feedQueryHref, resolveFeedDates, type DateSelection, type FeedQuery } from "./feed-query.ts";

/** Date links retain the applied query but restart its page position. Previous/next open the adjacent single day. */
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
    presets: feedDatePresets.map((kind) => {
      const dates = resolveFeedDates({ dates: { kind } }, today);
      return { kind, href: href({ kind }), current: range.startDate === dates.startDate && range.endDate === dates.endDate };
    }),
    previous: adjacent(range.startDate, -1), next: adjacent(range.endDate, 1), range,
  };
}

/** Empty days further than this from today are not archive pages, and generated links beyond it are not followed. */
export const archiveWindowDays = 31;
/** Like the adjacent links: null outside the MySQL calendar (1000-01-01) and the last reporting date (9999-12-31). */
function shiftDate(date: ReportingDate, days: number): ReportingDate | null {
  try {
    const target = addReportingDays(date, days);
    return target < "1000-01-01" ? null : target;
  } catch (error) { if (error instanceof CalendarValidationError) return null; throw error; }
}

/** Up to `count` days after `date` (before it when negative, in calendar order), stopping at either calendar end. */
export function adjacentDays(date: ReportingDate, count: number): ReportingDate[] {
  const days: ReportingDate[] = [];
  for (let step = 1; step <= Math.abs(count); step++) {
    const day = shiftDate(date, Math.sign(count) * step);
    if (day === null) break;
    days.push(day);
  }
  return count < 0 ? days.reverse() : days;
}

/** One day without stored fixtures beyond the window is not a page (404), so the calendar cannot be walked endlessly.
 * A day with fixtures stays a page at any age; ranges and nearby days keep their empty state. */
export function emptyArchiveIsMissing(range: Pick<ReportingDateRange, "startDate" | "dayCount">, today: ReportingDate, knownFixtures: number): boolean {
  if (range.dayCount !== 1 || knownFixtures > 0) return false;
  const earliest = shiftDate(today, -archiveWindowDays), latest = shiftDate(today, archiveWindowDays);
  return earliest !== null && range.startDate < earliest || latest !== null && range.startDate > latest;
}

/** Generated future days beyond the window are nofollow; past days stay followable, since empty ones answer 404. */
export function dayLinkRel(date: ReportingDate, today: ReportingDate): "nofollow" | undefined {
  const latest = shiftDate(today, archiveWindowDays);
  return latest !== null && date > latest ? "nofollow" : undefined;
}
