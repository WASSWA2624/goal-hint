import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { getAnalyticsServices, loginNotice, verifyAdminSession } from "@/server/analytics/analytics-http";
import { memberCookieName } from "@/server/members/member-sessions";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "Analytics · Goal Hint",
  robots: { index: false, follow: false, nocache: true },
};

const currentReportingDate = () => getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));

/** Server-side gate: the dashboard (and every reporting API) requires a valid signed-in session. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const services = await getAnalyticsServices();
  const jar = await cookies();
  const admin = await verifyAdminSession(services, jar.get(services.config.cookies.session)?.value,
    jar.get(memberCookieName(services.config.production))?.value);
  if (admin) {
    return <AdminShell current="analytics" username={adminDisplayName(admin)} developmentCredentials={services.config.usingDevelopmentCredentials}>
      <AnalyticsDashboard today={currentReportingDate()} />
    </AdminShell>;
  }
  return <AnalyticsLogin {...loginNotice(services, await searchParams)} />;
}
