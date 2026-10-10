import "server-only";
import type { MetadataRoute } from "next";
import { canonicalUrl, discoveryRules, sitemapPage } from "../../domain/discovery.ts";
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
  return {
    async robots(): Promise<MetadataRoute.Robots> {
      const rules = { userAgent: "*", allow: "/", disallow: "/api/" };
      if (!policy().index) return { rules };
      const inventory = await reader().inventory();
      return { rules, sitemap: [canonicalUrl("/sitemap.xml"),
        ...(["matches", "dates"] as const).flatMap(kind => inventory[kind] ? pages(inventory[kind]).map(({ id }) =>
          canonicalUrl(`/${kind === "matches" ? "matches" : "archive"}/sitemap/${id}.xml`)) : [])] };
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
