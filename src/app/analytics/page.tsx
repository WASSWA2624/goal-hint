import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { getAnalyticsServices, verifyAdminSession } from "@/server/analytics/analytics-http";
import { memberCookieName } from "@/server/members/member-sessions";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";

export const metadata: Metadata = {
  title: "Analytics · Goal Hint",
  robots: { index: false, follow: false, nocache: true },
};

const currentReportingDate = () => getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));

/** Server-side gate: the dashboard (and every reporting API) requires a valid signed-in session. */
export default async function AnalyticsPage() {
  await connection();
  const services = await getAnalyticsServices();
  const jar = await cookies();
  const admin = await verifyAdminSession(services, jar.get(memberCookieName(services.config.production))?.value);
  if (admin) {
    return <AdminFrame database={services.database} current="analytics" username={adminDisplayName(admin)}>
      <AnalyticsDashboard today={currentReportingDate()} />
    </AdminFrame>;
  }
  redirectToAccountLogin();
}
