import "server-only";
import { getAnalyticsServices } from "./analytics-http";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";

/** Resolve the public availability flag with the page, without a browser round trip. */
export async function AnalyticsProvider() {
  const { collector } = await getAnalyticsServices();
  return <AnalyticsTracker available={collector !== null} />;
}
