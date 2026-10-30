import { notFound } from "next/navigation";
import BannerFixture from "../matches/page";
import { PublicShell } from "@/app/_components/public-shell";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { parseReportingDate } from "@/domain/calendar";
import { bannerScenario } from "../../fixture";
import { BannerProbe } from "../../probe";

/** Exercise real pathname-based banner hiding without importing account or payment services. */
export default async function BannerSurfaceFixture({ params, searchParams }: {
  params: Promise<{ surface: string }>; searchParams: Promise<{ state?: string }>;
}) {
  const { surface } = await params;
  if (surface === "best-slips") {
    const { state } = await searchParams;
    return <PublicShell locale="en" today={parseReportingDate("2026-10-29")} current="best-slips" app compact>
      <AppBrandBar locale="en" bestSlips /><BannerProbe initial={bannerScenario(state)} />
    </PublicShell>;
  }
  if (surface !== "account" && surface !== "subscribe") notFound();
  return <BannerFixture searchParams={searchParams} />;
}

export const dynamic = "force-dynamic";
export { metadata } from "../matches/page";
