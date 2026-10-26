import { createDiscoveryRoutes } from "@/server/seo/discovery-routes";

export const dynamic = "force-dynamic";
const routes = createDiscoveryRoutes();

/** Next.js has no native index for `generateSitemaps` shards; this lists them under one URL. */
export async function GET() {
  return new Response(await routes.sitemapIndex(), { headers: {
    "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
