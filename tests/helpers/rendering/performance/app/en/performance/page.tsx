import { PublicShell } from "@/app/_components/public-shell";
import { PerformanceDashboard, type PerformanceDashboardProps } from "@/components/performance/performance-dashboard";
import { parseReportingDate } from "@/domain/calendar";
import scenarios from "../../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic performance acceptance", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams, name = typeof query.state === "string" && query.state in scenarios ? query.state : "unapproved";
  const selected = scenarios[name as keyof typeof scenarios] as PerformanceDashboardProps;
  return <PublicShell locale="en" current="performance" today={parseReportingDate("2026-10-09")} app compact>
    <p>Synthetic display fixture. No real forecasts or bets.</p><PerformanceDashboard {...selected} />
  </PublicShell>;
}
