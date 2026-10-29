import type { Metadata } from "next";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { RecordBody } from "@/components/admin/record-workspace";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";
import { AuditReport } from "@/components/admin/audit-report";
import { ownerAuditActions } from "@/server/admin/audit";
import { auditDateBounds, auditPeriods } from "@/domain/admin-audit";
import { TextLink } from "@/components/ui/controls";
export const metadata: Metadata = { title: "Audit · Admin · Goal Hint" };
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const action = typeof params.action === "string" && ownerAuditActions.includes(params.action as typeof ownerAuditActions[number]) ? params.action : "";
  const period = auditPeriods.find(item => item.value === params.period)?.value ?? "all";
  const startDate = period === "custom" && typeof params.startDate === "string" ? params.startDate : "";
  const endDate = period === "custom" && typeof params.endDate === "string" ? params.endDate : "";
  try { auditDateBounds({ period, startDate, endDate }); }
  catch { return <RecordBody><h1>Audit</h1><Notice $tone="error" role="alert">Invalid audit date range. <TextLink href="/admin/audit">Reset filters</TextLink></Notice></RecordBody>; }
  const data = db ? await createSubscribers(db).audit(action, { period, startDate, endDate }).catch(() => null) : null;
  // The report owns the title row (its Export button sits beside the h1 on phones); the error state keeps the same h1.
  return data ? <AuditReport rows={data} actions={ownerAuditActions} action={action} period={period} startDate={startDate} endDate={endDate} />
    : <RecordBody><h1>Audit</h1><Notice $tone="error" role="alert">Activity is unavailable. Try again shortly.</Notice></RecordBody>;
}
