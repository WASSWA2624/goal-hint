import { PublicShell } from "@/app/_components/public-shell";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { parseReportingDate } from "@/domain/calendar";
import { bannerScenario } from "../../fixture";
import { BannerProbe } from "../../probe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscription banner acceptance", robots: { index: false, follow: false } };

export default async function BannerFixture({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <PublicShell locale="en" today={parseReportingDate("2026-10-29")} current="today" app compact>
    <AppBrandBar locale="en" />
    <BannerProbe initial={bannerScenario(state)} />
  </PublicShell>;
}
