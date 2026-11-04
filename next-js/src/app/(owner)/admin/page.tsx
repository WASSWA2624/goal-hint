import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminFrame } from "@/app/_components/admin-frame";
import { getShellInstant } from "@/app/_components/shell-time";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { OverviewLoading, OverviewReport } from "@/components/admin/owner-reports";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createSubscribers, revenueBounds } from "@/server/admin/subscribers";
import { createPaymentNoticeAdmin } from "@/server/admin/payment-notices";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import type { DatabaseRuntime } from "@/server/database/client";
import { LoadingTheme } from "@/styles/loading-theme";

export const metadata: Metadata = { title: "Admin · Goal Hint" };

/** Server-side gate: shared account login when signed out, the dashboard when signed in. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  return <>
    <VisuallyHidden as="h1">Overview</VisuallyHidden>
    <LoadingTheme>
      <Suspense fallback={<OverviewLoading />}>
        {database ? <OverviewMetrics database={database} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
      </Suspense>
    </LoadingTheme>
  </>;
}

async function OverviewMetrics({ database }: { database: DatabaseRuntime }) {
  const now = await getShellInstant();
  const [value, noticeCount] = await Promise.all([
    createSubscribers(database, () => now).overview().catch(() => null),
    createPaymentNoticeAdmin(database, () => now).attentionCount().catch(() => null),
  ]);
  if (!value) return <Notice $tone="error">Member storage is unavailable.</Notice>;
  const dates = revenueBounds(now);
  const auditQuery = new URLSearchParams({ action: "uploads_busy", period: "custom",
    startDate: getReportingDate(utcInstantFromEpochMilliseconds(+dates.week)),
    endDate: getReportingDate(now) });
  return <AdminFrame pendingCount={value.pending}>
    <OverviewReport report={{ value, noticeCount, uploadAlertsHref: `/admin/audit?${auditQuery}` }} />
  </AdminFrame>;
}
