import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentsEditor } from "@/components/admin/payments-editor";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";
import { createPaymentReview } from "@/server/admin/payment-review";
import { plansServiceFor } from "@/server/members/plans";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }): Promise<Metadata> {
  const page = await adminPageGate(searchParams);
  const count = page.owner && page.services.database ? await page.services.database.query(tx => tx.paymentSubmission.count({ where: { status: "pending" } })).catch(() => null) : null;
  return { title: `${count ? `(${count}) ` : ""}Payments · Admin · Goal Hint` };
}
export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  const params = await searchParams, tab = typeof params.tab === "string" ? params.tab : "pending";
  const db = page.services.database;
  const data = db ? await createPaymentReview(db).list(tab).catch(() => null) : null;
  const plans = db ? await plansServiceFor(db).list().catch(() => []) : [];
  return <AdminShell current="payments" username={adminDisplayName(page.owner)} developmentCredentials={page.services.config.usingDevelopmentCredentials} {...(data ? { pendingCount: data.pendingCount } : {})}><PageTitle><h1>Payments</h1></PageTitle>{data ? <PaymentsEditor queue={data} tab={tab} plans={plans} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}</AdminShell>;
}
