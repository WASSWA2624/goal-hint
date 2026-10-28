import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PublicShell } from "@/app/_components/public-shell";
import { AdminShell } from "@/components/admin/admin-shell";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { parseReportingDate } from "@/domain/calendar";
import { MatchDetails } from "@/components/match/details/match-details";
import { DetailStateProvider } from "@/state/detail-provider";
import { detailFixture } from "../detail-fixture";

export const dynamic = "force-dynamic";

function TextScale({ percent }: { percent: 100 | 200 }) {
  return <style data-fixture-text-scale={percent}>{percent === 200 ? ":root { font-size: 200%; }" : ""}</style>;
}

function Content({ surface, textScale }: { surface: string; textScale: 100 | 200 }) {
  const suffix = textScale === 200 ? "?textScale=200" : "";
  return <section data-compact-header-fixture={surface}>
    <TextScale percent={textScale} />
    <h1>Quiet controls acceptance</h1>
    <p>Real shared headers with synthetic account sessions and payment counts.</p>
    <nav aria-label="Acceptance surfaces">
      <Link href={`/public${suffix}`} prefetch={false}>Public page</Link>{" · "}<Link href={`/app${suffix}`} prefetch={false}>App page</Link>{" · "}<Link href={`/admin${suffix}`} prefetch={false}>Administrator</Link>{" · "}<Link href={`/detail${suffix}`} prefetch={false}>Match detail</Link>
    </nav>
  </section>;
}

export default async function Page({ params, searchParams }: { params: Promise<{ surface: string }>; searchParams: Promise<{ textScale?: string }> }) {
  const { surface } = await params;
  const textScale = (await searchParams).textScale === "200" ? 200 : 100;
  if (surface === "admin") return <AdminShell username="Preview administrator" current="overview"><Content surface={surface} textScale={textScale} /></AdminShell>;
  if (surface === "detail") return <PublicShell locale="en" today={parseReportingDate("2026-10-28")} current="today" app>
    <div data-compact-header-fixture={surface}><TextScale percent={textScale} /><Suspense fallback={<p>Preparing synthetic match</p>}><DetailStateProvider>
      <MatchDetails data={detailFixture} preview={null} locale="en" showAccount />
    </DetailStateProvider></Suspense></div>
  </PublicShell>;
  if (surface !== "public" && surface !== "app") notFound();
  return <PublicShell locale="en" today={parseReportingDate("2026-10-28")} current="today" app={surface === "app"} compact={surface === "app"}>
    {surface === "app" && <AppBrandBar locale="en" />}
    <Content surface={surface} textScale={textScale} />
  </PublicShell>;
}
