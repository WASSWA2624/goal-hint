import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { CodesEditor } from "@/components/admin/code-tools";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";
import { createPaymentReview } from "@/server/admin/payment-review";
import { plansServiceFor } from "@/server/members/plans";
export const metadata: Metadata = { title: "Codes · Admin · Goal Hint" };
export default async function AdminCodesPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  const db = page.services.database;
  const data = db ? await createPaymentReview(db).codes().catch(() => null) : null;
  const plans = db ? await plansServiceFor(db).list().catch(() => []) : [];
  return <AdminShell current="codes" username={page.owner.username} developmentCredentials={page.services.config.usingDevelopmentCredentials}><PageTitle><h1>Codes</h1></PageTitle>{data ? <CodesEditor owner={page.owner.username} initialCodes={data} plans={plans} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}</AdminShell>;
}
