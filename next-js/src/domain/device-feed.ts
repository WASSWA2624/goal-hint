import { addReportingDays, type ReportingDate } from "./calendar.ts";
import { isFeedDatePreset, parseFeedQuery, serializeFeedQuery, type FeedQuery } from "./feed-query.ts";
import type { AppSection } from "./navigation.ts";
import { matchesHref } from "./navigation-paths.ts";

/** Only an unzoned relative entry adopts the device; named dates and shared zones stay stable. */
export function deviceFeedQuery(query: FeedQuery, zone: string): FeedQuery | null {
  return isFeedDatePreset(query.dates.kind) && !query.zone && !query.time
    ? { ...query, zone, page: 1 } : null;
}

/** Legacy Live/Results entries open the unified Matches feed with explicit dates. */
export function deviceFeedEntryHref(entry: Exclude<AppSection, "slips">, today: ReportingDate, zone: string, locale?: string): string {
  const query = parseFeedQuery({ tz: zone, ...(entry === "results" ? { date: addReportingDays(today, -1), status: "finished" }
    : entry === "live" ? { when: "today", status: "live" } : {}) }, { today, ...(locale ? { locale } : {}) });
  const parameters = serializeFeedQuery(query, today);
  // A fresh navigation entry adopts the viewer's eligible default, rather than opting out.
  parameters.delete("picks");
  const suffix = parameters.toString();
  const path = matchesHref(locale);
  return suffix ? `${path}?${suffix}` : path;
}
