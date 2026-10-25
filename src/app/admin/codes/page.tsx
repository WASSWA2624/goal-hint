import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { CodesEditor } from "@/components/admin/code-tools";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createPaymentReview } from "@/server/admin/payment-review";
import { plansServiceFor } from "@/server/members/plans";
export const metadata: Metadata = { title: "Codes · Admin · Goal Hint" };
export default async function AdminCodesPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const db = page.services.database;
  const data = db ? await createPaymentReview(db).codes().catch(() => null) : null;
  const plans = db ? await plansServiceFor(db).list().catch(() => []) : [];
  return <AdminFrame database={page.services.database} current="codes" username={adminDisplayName(page.owner)}>
    <DeskHead><DeskTitle><h1>Codes</h1></DeskTitle></DeskHead>
    {data ? <CodesEditor initialCodes={data} plans={plans} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
  </AdminFrame>;
}
