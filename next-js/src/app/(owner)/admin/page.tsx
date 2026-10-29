import type { Metadata } from "next";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { OverviewReport } from "@/components/admin/owner-reports";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { createSubscribers } from "@/server/admin/subscribers";
import { createPaymentNoticeAdmin } from "@/server/admin/payment-notices";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";

export const metadata: Metadata = { title: "Admin · Goal Hint" };
/** When this request rendered: how long an SMS notice has waited is judged against it, on the server and in hydration. */
const renderedAt = () => Date.now();

/** Server-side gate: shared account login when signed out, the dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const subscribers = page.services.database ? createSubscribers(page.services.database) : null;
  const [value, payments, notices] = await Promise.all([
    subscribers?.overview().catch(() => null) ?? null,
    subscribers?.pendingPayments().catch(() => null) ?? null,
    page.services.database ? createPaymentNoticeAdmin(page.services.database).attention().catch(() => null) : null,
  ]);
  return (
    <AdminFrame {...(value ? { pendingCount: value.pending } : {})}>
      <DeskHead><DeskTitle><h1>Overview</h1></DeskTitle></DeskHead>
      {value ? <OverviewReport value={value} payments={payments} notices={notices} now={renderedAt()} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
    </AdminFrame>
  );
}
