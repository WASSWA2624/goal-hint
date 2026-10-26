import type { Metadata } from "next";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { ForecastSourcesReport } from "@/components/admin/forecast-sources-report";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSourceComparisonService } from "@/server/comparison/source-comparison-service";
import { getRuntimePolicy } from "@/server/config/runtime-policy";
export const metadata: Metadata = { title: "Forecast sources · Admin · Goal Hint" };
export default async function AdminForecastsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database, query = new URLSearchParams();
  for (const key of ["from", "to", "market"] as const) { const value = params[key]; if (typeof value === "string") query.set(key, value); }
  const data = db ? await createSourceComparisonService({ database: db, competitionIds: getRuntimePolicy().choices.competitionIds ?? [] })
    .read(query).catch(() => null) : null;
  return <AdminFrame database={db}>
    {data ? <ForecastSourcesReport value={data} />
      : <><DeskHead><DeskTitle><h1>Forecast sources</h1></DeskTitle></DeskHead>
        <Notice $tone="error" role="alert">The source comparison is unavailable. Check the dates and try again shortly.</Notice></>}
  </AdminFrame>;
}
