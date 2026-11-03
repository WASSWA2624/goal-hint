import { createPerformanceRoute } from "@/app/_components/performance-route";
import { PerformanceDashboard, type PerformanceDashboardProps } from "@/components/performance/performance-dashboard";
import { PublicShell } from "@/app/_components/public-shell";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import scenarios from "../../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic performance loading", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams, state = typeof input.state === "string" && input.state in scenarios.performance ? input.state : "unapproved";
  const selected = scenarios.performance[state as keyof typeof scenarios.performance] as PerformanceDashboardProps;
  if (input.stream !== "1") return <PublicShell locale="en" current="performance" app compact><PerformanceDashboard {...selected} /></PublicShell>;
  const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
  const read = async () => { await wait(1_800); return selected.report!; };
  const history = async () => { await wait(900); return selected.history; };
  if (input.blocking === "1") {
    const [report, publications] = await Promise.all([read(), history()]);
    return <PublicShell locale="en" current="performance" app compact><PerformanceDashboard {...selected} report={report} history={publications} /></PublicShell>;
  }
  const route = createPerformanceRoute({ read, history, instant: async () => utcInstantFromEpochMilliseconds(Date.parse("2026-10-09T12:00:00Z")) });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({
    from: selected.filters.from, to: selected.filters.to, market: selected.filters.market, source: selected.filters.source,
    ...(selected.history?.page && selected.history.page !== 1 ? { page: String(selected.history.page) } : {}),
  }) });
}
