import "server-only";
import { connection } from "next/server";
import { getAnalyticsServices } from "./analytics-http";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";

/** Resolve the public availability flag with the page, without a browser round trip. */
export async function AnalyticsProvider() {
  // Runtime database/consent availability must not initialize from local credentials during prerender.
  await connection();
  const { collector } = await getAnalyticsServices();
  return <AnalyticsTracker available={collector !== null} />;
}
