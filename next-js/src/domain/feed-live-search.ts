import type { ReportingDate } from "./calendar.ts";
import { feedQueryHref, normalizeFeedSearch, type FeedQuery } from "./feed-query.ts";

/** Live search is a page-one list change within the applied filter scope. */
export function liveFeedSearchQuery(query: FeedQuery, text: string): FeedQuery {
  return { ...query, search: normalizeFeedSearch(text), page: 1 };
}

/** App Router may restore the old server projection for an entry updated by shallow history. */
export function restoredLiveFeedSearch(href: string, query: FeedQuery, today: ReportingDate): string | null {
  const origin = "https://example.invalid";
  try {
    const current = new URL(href, origin);
    const value = current.searchParams.get("q") ?? "";
    const target = liveFeedSearchQuery(query, value);
    if (target.search === query.search && query.page === 1) return null;
    const canonical = new URL(feedQueryHref(target, today), origin);
    current.searchParams.sort(); canonical.searchParams.sort();
    return current.origin === canonical.origin && current.pathname === canonical.pathname && current.search === canonical.search ? value : null;
  } catch { return null; }
}
