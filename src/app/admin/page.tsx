import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { Muted, PageTitle, Panel } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";

export const metadata: Metadata = { title: "Admin · Goal Hint" };

/** Server-side gate: the owner login when signed out, the owner dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  return (
    <AdminShell current="overview" username={page.owner.username} developmentCredentials={page.services.config.usingDevelopmentCredentials}>
      <PageTitle><h1>Overview</h1></PageTitle>
      <Panel>
        <Muted>Paid access is not built yet. Payments, codes, subscribers, plans and settings will appear here as each part is added.</Muted>
      </Panel>
    </AdminShell>
  );
}
