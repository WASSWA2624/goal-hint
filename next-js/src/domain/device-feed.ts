import { addReportingDays, type ReportingDate } from "./calendar.ts";
import { feedQueryHref, isFeedDatePreset, parseFeedQuery, type FeedQuery } from "./feed-query.ts";
import type { AppSection } from "./navigation.ts";

/** Only an unzoned relative entry adopts the device; named dates and shared zones stay stable. */
export function deviceFeedQuery(query: FeedQuery, zone: string): FeedQuery | null {
  return isFeedDatePreset(query.dates.kind) && !query.zone && !query.time
    ? { ...query, zone, page: 1 } : null;
}

/** Today/Live remain relative; Results opens the device's previous calendar day. */
export function deviceFeedEntryHref(entry: Exclude<AppSection, "slips">, today: ReportingDate, zone: string, locale?: string): string {
  const query = parseFeedQuery({ tz: zone, ...(entry === "results" ? { date: addReportingDays(today, -1), status: "finished" }
    : entry === "live" ? { status: "live" } : {}) }, { today, ...(locale ? { locale } : {}) });
  return feedQueryHref(query, today);
}
