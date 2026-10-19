import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { OverviewReport } from "@/components/admin/owner-reports";
import { createSubscribers } from "@/server/admin/subscribers";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";

export const metadata: Metadata = { title: "Admin · Goal Hint" };

/** Server-side gate: the owner login when signed out, the owner dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  const value = page.services.database ? await createSubscribers(page.services.database).overview().catch(() => null) : null;
  return (
    <AdminShell current="overview" username={page.owner.username} developmentCredentials={page.services.config.usingDevelopmentCredentials}>
      <PageTitle><h1>Overview</h1></PageTitle>
      {value ? <OverviewReport value={value} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
    </AdminShell>
  );
}
