import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { adminPageGate } from "@/server/admin/admin-http";
import { AdminFrame } from "@/app/_components/admin-frame";

export const metadata: Metadata = {
  title: "Analytics · Goal Hint",
  robots: { index: false, follow: false, nocache: true },
};

const currentReportingDate = () => getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));

/** Server-side gate: the dashboard (and every reporting API) requires a valid signed-in session. */
export default async function AnalyticsPage() {
  const page = await adminPageGate();
  if (page.owner) {
    return <AdminFrame database={page.services.database}>
      <AnalyticsDashboard today={currentReportingDate()} />
    </AdminFrame>;
  }
  redirectToAccountLogin();
}
