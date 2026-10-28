import { Suspense } from "react";
import { MetadataRecovery } from "@/components/navigation/metadata-recovery";
import { AnalyticsProvider } from "@/server/analytics/analytics-provider";

/** Keep navigation metadata recovery and request-time analytics outside the anonymous offline entry. */
export function OnlineRuntime() {
  return <>
    <Suspense fallback={null}><MetadataRecovery /></Suspense>
    <Suspense fallback={null}><AnalyticsProvider /></Suspense>
  </>;
}
