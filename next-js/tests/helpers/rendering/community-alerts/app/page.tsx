import { PublicShell } from "@/app/_components/public-shell";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { parseReportingDate } from "@/domain/calendar";

export const dynamic = "force-dynamic";
export default function Page() {
  return <PublicShell locale="en" today={parseReportingDate("2026-11-03")} current="best-slips" app>
    <AppBrandBar locale="en" />
    <p data-community-fixture>Synthetic public community. No real accounts, payments or community destinations.</p>
  </PublicShell>;
}
