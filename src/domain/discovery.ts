import { activeFeedFilterCount, defaultFeedDatePreset, defaultSortDirection, resolveFeedDates, feedQueryHref, feedQueryRules, type FeedQuery } from "./feed-query.ts";
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
  const filtered = Boolean(query.zone) || activeFeedFilterCount(query) > 0 || query.sort.by !== "kickoff" || query.sort.direction !== defaultSortDirection.kickoff ||
    query.pageSize !== feedQueryRules.pageSize || range.dayCount !== 1 && query.dates.kind !== defaultFeedDatePreset;
  // Pin pagination/relative aliases to a dated collection. The plain home page stays /en.
  const home = query.dates.kind === defaultFeedDatePreset && query.page === 1;
  const canonicalQuery: FeedQuery = filtered || home ? query : { ...query,
    dates: range.dayCount === 1 ? { kind: "date", date: range.startDate }
      : { kind: "range", from: range.startDate, to: range.endDate } };
  return { path: feedQueryHref(canonicalQuery, today), eligible: !filtered, home, range };
}

export const discoveryRules = Object.freeze({ sitemapBatchSize: 2000 });
export function sitemapPage(id: string): number {
  if (!/^(0|[1-9]\d{0,8})$/u.test(id)) throw new RangeError("Invalid sitemap page.");
  return Number(id);
}

/** A sitemap index of absolute canonical locations, so Search Console needs one submission. */
export function sitemapIndexXml(locations: readonly string[]): string {
  const escape = (value: string) => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    locations.map((location) => `<sitemap>\n<loc>${escape(location)}</loc>\n</sitemap>\n`).join("")}</sitemapindex>\n`;
}

/** A match page earns indexing only with a published forecast; empty fixture shells stay noindex and out of sitemaps. */
export function matchPageIndexable(fixture: { forecast: { markets: readonly unknown[] } | null }): boolean {
  return (fixture.forecast?.markets.length ?? 0) > 0;
}

export function websiteStructuredData() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: publicPolicy.name,
    url: canonicalUrl("/en"), inLanguage: "en" };
}

/** Home-page identity: the WebSite plus the Organization that publishes it, with a crawlable square logo. */
export function homeStructuredData() {
  const { "@context": context, ...website } = websiteStructuredData(), organization = `${canonicalUrl("/en")}#organization`;
  return { "@context": context, "@graph": [
    { "@type": "Organization", "@id": organization, name: publicPolicy.name, url: canonicalUrl("/en"),
      logo: canonicalUrl("/brand/goal-hint-app-icon-512.png") },
    { ...website, "@id": `${canonicalUrl("/en")}#website`, publisher: { "@id": organization } },
  ] };
}

/** Breadcrumbs follow the visible path: home, the EAT day's collection, then the current page (no URL). */
export function breadcrumbStructuredData(items: readonly Readonly<{ name: string; path?: string }>[]) {
  if (items.length < 2) throw new RangeError("Breadcrumbs need at least two levels.");
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({
    "@type": "ListItem", position: index + 1, name: item.name, ...(item.path ? { item: canonicalUrl(item.path) } : {}) })) };
}
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
