import { activeFeedFilterCount, resolveFeedDates, feedQueryHref, feedQueryRules, type FeedQuery } from "./feed-query.ts";
import type { ReportingDate } from "./calendar.ts";
import { publicPolicy } from "./public-policy.ts";

export type DiscoveryPolicy = Readonly<{ deployment: "development" | "staging" | "production"; index: boolean }>;
export function resolveDiscoveryPolicy(input: { deployment?: string | undefined; runtime?: string | undefined; releaseVerified: boolean }): DiscoveryPolicy {
  const deployment = input.deployment === "production" ? "production" : input.deployment === "staging" ? "staging" : "development";
  return { deployment, index: deployment === "production" && input.runtime === "production" && input.releaseVerified };
}

/** Request hosts, preview origins and absolute/untrusted paths cannot choose a canonical origin. */
export function canonicalUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f#]/u.test(path)) throw new RangeError("Invalid canonical path.");
  const url = new URL(path, publicPolicy.origin);
  if (url.origin !== publicPolicy.origin) throw new RangeError("Invalid canonical origin.");
  return url.href;
}

export function feedDiscovery(query: FeedQuery, today: ReportingDate) {
  const range = resolveFeedDates(query, today);
  const filtered = activeFeedFilterCount(query) > 0 || query.sort.by !== "kickoff" || query.sort.direction !== "asc" ||
    query.pageSize !== feedQueryRules.pageSize || range.dayCount !== 1;
  // Pin pagination/relative aliases to a dated collection. The plain home page stays /en.
  const home = query.dates.kind === "today" && query.page === 1;
  const canonicalQuery: FeedQuery = filtered ? query : { ...query,
    dates: home ? { kind: "today" } : { kind: "date", date: range.startDate } };
  return { path: feedQueryHref(canonicalQuery, today), eligible: !filtered, home, range };
}

export const discoveryRules = Object.freeze({ sitemapBatchSize: 2000 });
export function sitemapPage(id: string): number {
  if (!/^(0|[1-9]\d{0,8})$/u.test(id)) throw new RangeError("Invalid sitemap page.");
  return Number(id);
}

export function websiteStructuredData() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: publicPolicy.name,
    url: canonicalUrl("/en"), inLanguage: "en" };
}
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
