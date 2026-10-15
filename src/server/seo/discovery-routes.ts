import "server-only";
import type { MetadataRoute } from "next";
import { canonicalUrl, discoveryRules, sitemapIndexXml, sitemapPage } from "../../domain/discovery.ts";
import { informationPages } from "../../domain/navigation.ts";
import { getDiscoveryPolicy } from "./policy.ts";
import { informationPublicationReady } from "./metadata.ts";
import { readPublicDiscovery } from "./discovery-read.ts";

/** Shared native MetadataRoute controllers; acceptance may bind an isolated stored reader. */
export function createDiscoveryRoutes({ policy = getDiscoveryPolicy, reader = readPublicDiscovery,
  missing = (): never => { throw new RangeError("Unknown sitemap page."); } } = {}) {
  const pages = (count: number) => Array.from({ length: Math.max(1, Math.ceil(count / discoveryRules.sitemapBatchSize)) }, (_, id) => ({ id }));
  async function ids(kind: "matches" | "dates") {
    return policy().index ? pages((await reader().inventory())[kind]) : [{ id: 0 }];
  }
  async function shard(kind: "matches" | "dates", { id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
    let page;
    try { page = sitemapPage(await id); } catch { return missing(); }
    if (!policy().index) return page === 0 ? [] : missing();
    const source = reader();
    // Reject invented shard IDs before an arbitrarily large OFFSET scans the cohort.
    if (page > 0 && page * discoveryRules.sitemapBatchSize >= (await source.inventory())[kind]) return missing();
    const rows = await source[kind](page);
    if (page > 0 && rows.length === 0) return missing();
    return rows.map(row => ({ url: canonicalUrl(row.path), ...(row.lastModified ? { lastModified: row.lastModified } : {}) }));
  }
  /** Every populated map: static pages first, then each bounded match and archive shard. */
  async function maps() {
    const inventory = await reader().inventory();
    // Public root-level rewrites give every shard site-wide scope, including /en pages.
    // Native nested metadata routes remain available for compatibility.
    return [canonicalUrl("/sitemap.xml"), ...(["matches", "dates"] as const).flatMap(kind => inventory[kind] ? pages(inventory[kind]).map(({ id }) =>
      canonicalUrl(`/sitemap-${kind === "matches" ? "matches" : "archive"}-${id}.xml`)) : [])];
  }
  return {
    async robots(): Promise<MetadataRoute.Robots> {
      // The private analytics dashboard is never crawled; it also answers noindex and requires sign-in.
      const rules = { userAgent: "*", allow: "/", disallow: ["/api/", "/analytics"] };
      if (!policy().index) return { rules };
      // One index URL covers every shard, so Search Console needs a single submission.
      return { rules, sitemap: canonicalUrl("/sitemap-index.xml") };
    },
    /** XML body of `/sitemap-index.xml`; empty before release so no prelaunch URL is advertised. */
    async sitemapIndex(): Promise<string> {
      return sitemapIndexXml(policy().index ? await maps() : []);
    },
    async sitemap(): Promise<MetadataRoute.Sitemap> {
      if (!policy().index) return [];
      return ["/en", ...informationPages.filter(informationPublicationReady).map(page => `/en/${page}`)].map(path => ({ url: canonicalUrl(path) }));
    },
    matchIds: () => ids("matches"), dateIds: () => ids("dates"),
    matches: (props: { id: Promise<string> }) => shard("matches", props),
    dates: (props: { id: Promise<string> }) => shard("dates", props),
  };
}
