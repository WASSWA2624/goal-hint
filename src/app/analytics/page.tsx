import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { getAnalyticsServices, loginNotice } from "@/server/analytics/analytics-http";

export const metadata: Metadata = {
  title: "Analytics · Goal Hint",
  robots: { index: false, follow: false, nocache: true },
};

const currentReportingDate = () => getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));

/** Server-side gate: the dashboard (and every reporting API) requires a valid signed-in session. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const services = await getAnalyticsServices();
  const token = (await cookies()).get(services.config.cookies.session)?.value;
  const admin = services.auth ? await services.auth.verify(token).catch(() => null) : null;
  if (admin) {
    return <AnalyticsDashboard username={admin.username} today={currentReportingDate()}
      developmentCredentials={services.config.usingDevelopmentCredentials} />;
  }
  return <AnalyticsLogin {...loginNotice(services, await searchParams)} />;
}
