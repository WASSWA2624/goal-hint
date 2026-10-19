import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";
import { createSubscribers } from "@/server/admin/subscribers";
import { AuditReport } from "@/components/admin/owner-reports";
import { ownerAuditActions } from "@/server/admin/audit";
export const metadata: Metadata = { title: "Audit · Admin · Goal Hint" };
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  const params = await searchParams, db = page.services.database;
  const action = typeof params.action === "string" ? params.action : "";
  const data = db ? await createSubscribers(db).audit(action).catch(() => null) : null;
  return <AdminShell current="audit" username={page.owner.username} developmentCredentials={page.services.config.usingDevelopmentCredentials}><PageTitle><h1>Audit</h1></PageTitle>{data ? <AuditReport rows={data} actions={ownerAuditActions} action={action} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}</AdminShell>;
}
