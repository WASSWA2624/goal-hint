import "server-only";
import { permanentRedirect } from "next/navigation";
import { feedQueryKeys } from "../../domain/feed-query.ts";
import { matchesHref } from "../../domain/navigation-paths.ts";

/** Bookmarks to the old homepage feed, including native search/filter forms, moved to /en/matches for good and keep their
 * whole query there. Other parameters (shared ?ref= or ?igshid= links) are not feed state: the home page renders, noindex. */
export function redirectLegacyFeedQuery(locale: string, query: Readonly<Record<string, string | string[] | undefined>>): void {
  if (!Object.keys(query).some((key) => feedQueryKeys.has(key))) return;
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) parameters.append(key, item);
  permanentRedirect(`${matchesHref(locale)}?${parameters}`);
}
