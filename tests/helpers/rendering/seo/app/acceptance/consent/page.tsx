import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";

export const dynamic = "force-dynamic";

export default async function ConsentAcceptance({ searchParams }: { searchParams: Promise<{ enabled?: string }> }) {
  const enabled = (await searchParams).enabled !== "false";
  return <main><h1>Consent rendering acceptance</h1><AnalyticsTracker available={enabled} /></main>;
}
