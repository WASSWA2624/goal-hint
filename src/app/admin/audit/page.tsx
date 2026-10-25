import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
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
  // The report owns the title row (its Export button sits beside the h1 on phones); the error state keeps the same h1.
  return <AdminFrame database={page.services.database} current="audit" username={adminDisplayName(page.owner)}>
    {data ? <AuditReport rows={data} actions={ownerAuditActions} action={action} />
      : <><DeskHead><DeskTitle><h1>Audit log</h1></DeskTitle></DeskHead>
        <Notice $tone="error" role="alert">Activity is unavailable. Try again shortly.</Notice></>}
  </AdminFrame>;
}
