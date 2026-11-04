import type { Metadata } from "next";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { OverviewReport } from "@/components/admin/owner-reports";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createSubscribers } from "@/server/admin/subscribers";
import { createPaymentNoticeAdmin } from "@/server/admin/payment-notices";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";

export const metadata: Metadata = { title: "Admin · Goal Hint" };

/** Server-side gate: shared account login when signed out, the dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  const [value, noticeCount] = database ? await Promise.all([
    createSubscribers(database).overview().catch(() => null),
    createPaymentNoticeAdmin(database).attentionCount().catch(() => null),
  ]) : [null, null];
  return (
    <AdminFrame {...(value ? { pendingCount: value.pending } : {})}>
      <VisuallyHidden as="h1">Overview</VisuallyHidden>
      {value ? <OverviewReport value={value} noticeCount={noticeCount} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
    </AdminFrame>
  );
}
