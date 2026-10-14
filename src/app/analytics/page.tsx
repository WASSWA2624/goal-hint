import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { AnalyticsLogin, type LoginProblem, type LoginStatus } from "@/components/analytics/dashboard/analytics-login";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";

export const metadata: Metadata = {
  title: "Analytics · Goal Hint",
  robots: { index: false, follow: false, nocache: true },
};

const statuses: readonly LoginStatus[] = ["invalid", "locked", "unavailable", "signed-out"];
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
  const parameters = await searchParams;
  const login = typeof parameters.login === "string" && (statuses as readonly string[]).includes(parameters.login) ? parameters.login as LoginStatus : null;
  const retry = typeof parameters.retry === "string" && /^\d{1,5}$/.test(parameters.retry) ? Number(parameters.retry) : null;
  const problem: LoginProblem = services.config.adminProblem ?? (services.auth ? null : "storage");
  return <AnalyticsLogin status={login} problem={problem} retryAfterSeconds={retry} />;
}
