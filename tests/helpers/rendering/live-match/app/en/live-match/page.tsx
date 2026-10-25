import { PublicShell } from "@/app/_components/public-shell";
import { LiveMatchPanel } from "@/components/match/live-match-panel";
import { parseReportingDate } from "@/domain/calendar";
import type { LiveMatchSnapshot } from "@/domain/live-match";
import scenarios from "../../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic match statistics acceptance", robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams, name = typeof query.state === "string" && query.state in scenarios.snapshots ? query.state : "live";
  const snapshot = scenarios.snapshots[name as keyof typeof scenarios.snapshots] as LiveMatchSnapshot | null;
  return <PublicShell locale="en" current="live" today={parseReportingDate("2026-10-25")} app compact>
    <p>Synthetic display fixture. No real match or provider request.</p>
    <LiveMatchPanel snapshot={snapshot} asOf={scenarios.asOf} home="Synthetic Home Club" away="Synthetic Away Club" locale="en" />
  </PublicShell>;
}
