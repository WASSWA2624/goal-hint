import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminShell } from "@/components/admin/admin-shell";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";
import { AuditReport } from "@/components/admin/audit-report";
import { ownerAuditActions } from "@/server/admin/audit";
export const metadata: Metadata = { title: "Audit · Admin · Goal Hint" };
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const action = typeof params.action === "string" && ownerAuditActions.includes(params.action as typeof ownerAuditActions[number]) ? params.action : "";
  const data = db ? await createSubscribers(db).audit(action).catch(() => null) : null;
  return <AdminShell current="audit" username={adminDisplayName(page.owner)}>
    <PageTitle><h1>Audit log</h1><p>Activity and changes</p></PageTitle>
    {data ? <AuditReport rows={data} actions={ownerAuditActions} action={action} />
      : <Notice $tone="error" role="alert">Activity is unavailable. Try again shortly.</Notice>}
  </AdminShell>;
}
