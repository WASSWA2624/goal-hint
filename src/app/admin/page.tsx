import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { OverviewReport } from "@/components/admin/owner-reports";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { createSubscribers } from "@/server/admin/subscribers";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";

export const metadata: Metadata = { title: "Admin · Goal Hint" };

/** Server-side gate: shared account login when signed out, the dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const subscribers = page.services.database ? createSubscribers(page.services.database) : null;
  const [value, payments] = await Promise.all([
    subscribers?.overview().catch(() => null) ?? null,
    subscribers?.pendingPayments().catch(() => null) ?? null,
  ]);
  return (
    <AdminFrame database={page.services.database} current="overview" username={adminDisplayName(page.owner)} {...(value ? { pendingCount: value.pending } : {})}>
      <DeskHead><DeskTitle><h1>Overview</h1></DeskTitle></DeskHead>
      {value ? <OverviewReport value={value} payments={payments} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
    </AdminFrame>
  );
}
