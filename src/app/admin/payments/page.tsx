import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { PaymentsEditor } from "@/components/admin/payments-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { DeskHead } from "@/components/admin/desk-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createPaymentReview } from "@/server/admin/payment-review";
import { plansServiceFor } from "@/server/members/plans";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }): Promise<Metadata> {
  const page = await adminPageGate(searchParams);
  const count = page.owner && page.services.database ? await page.services.database.query(tx => tx.paymentSubmission.count({ where: { status: "pending" } })).catch(() => null) : null;
  return { title: `${count ? `(${count}) ` : ""}Payments · Admin · Goal Hint` };
}
export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, tab = typeof params.tab === "string" && ["pending", "approved", "rejected", "superseded"].includes(params.tab) ? params.tab : "pending";
  const db = page.services.database;
  const [data, plans] = db ? await Promise.all([
    createPaymentReview(db).list(tab).catch(() => null),
    plansServiceFor(db).list().catch(() => []),
  ]) : [null, []] as const;
  return <AdminFrame database={page.services.database} current="payments" username={adminDisplayName(page.owner)} {...(data ? { pendingCount: data.pendingCount } : {})}>{data ? <PaymentsEditor queue={data} tab={tab} plans={plans} /> : <><DeskHead><h1>Payments</h1></DeskHead><Notice $tone="error">Member storage is unavailable.</Notice></>}</AdminFrame>;
}
