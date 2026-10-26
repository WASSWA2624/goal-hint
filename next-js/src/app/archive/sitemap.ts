import { createDiscoveryRoutes } from "@/server/seo/discovery-routes";
import { notFound } from "next/navigation";

const routes = createDiscoveryRoutes({ missing: notFound });
export const dynamic = "force-dynamic";
export const generateSitemaps = routes.dateIds;
export default routes.dates;
