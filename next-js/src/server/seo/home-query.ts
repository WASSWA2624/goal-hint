import "server-only";
import { permanentRedirect } from "next/navigation";
import { addReportingDays, type ReportingDate } from "../../domain/calendar.ts";
import { feedDefaults } from "../../domain/feed-query.ts";
import { feedHref, homeHref, informationHref, performanceHref } from "../../domain/navigation.ts";
import type { TextKey } from "../../i18n/messages.ts";

/** Root and locale entry points share Matches, retaining legacy feed bookmarks and native form fields.
 * Best Slips kept its filters in client state and API requests; its former home URL did not consume those filters. */
export function redirectHomeQuery(locale: string, query: Readonly<Record<string, string | string[] | undefined>>): never {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) parameters.append(key, item);
  permanentRedirect(`${homeHref(locale)}${parameters.size ? `?${parameters}` : ""}`);
}

/** Without slips the Best Slips page is nearly empty; plain links keep the nearby dated archives, help and results one step away.
 * Available slips need no extra links. */
export function homeBrowseLinks(result: Readonly<{ day: ReportingDate; slips: readonly unknown[] }>, locale: string): ReadonlyArray<readonly [string, TextKey]> {
  if (result.slips.length > 0) return [];
  const day = (offset: number) => feedHref({ date: addReportingDays(result.day, offset), status: feedDefaults.today.status }, locale);
  return [[day(-1), "feed.date.yesterday"], [day(0), "feed.date.today"], [day(1), "feed.date.tomorrow"],
    [informationHref("help", locale), "navigation.help"], [performanceHref(locale), "performance.title"]];
}
