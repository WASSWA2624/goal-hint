import "server-only";
import { permanentRedirect } from "next/navigation";
import { addReportingDays, type ReportingDate } from "../../domain/calendar.ts";
import { feedDefaults, feedQueryKeys } from "../../domain/feed-query.ts";
import { feedHref, informationHref, matchesHref, performanceHref } from "../../domain/navigation.ts";
import type { TextKey } from "../../i18n/messages.ts";

/** Bookmarks to the old homepage feed, including native search/filter forms, moved to /en/matches for good and keep their
 * whole query there. Other parameters (shared ?ref= or ?igshid= links) are not feed state: the home page renders, noindex. */
export function redirectLegacyFeedQuery(locale: string, query: Readonly<Record<string, string | string[] | undefined>>): void {
  if (!Object.keys(query).some((key) => feedQueryKeys.has(key))) return;
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) parameters.append(key, item);
  permanentRedirect(`${matchesHref(locale)}?${parameters}`);
}

/** Without slips the home page is nearly empty; plain links keep the nearby dated archives, help and results one step away.
 * Available slips need no extra links. */
export function homeBrowseLinks(result: Readonly<{ day: ReportingDate; slips: readonly unknown[] }>, locale: string): ReadonlyArray<readonly [string, TextKey]> {
  if (result.slips.length > 0) return [];
  const day = (offset: number) => feedHref({ date: addReportingDays(result.day, offset), status: feedDefaults.today.status }, locale);
  return [[day(-1), "feed.date.yesterday"], [day(0), "feed.date.today"], [day(1), "feed.date.tomorrow"],
    [informationHref("help", locale), "navigation.help"], [performanceHref(locale), "performance.title"]];
}
