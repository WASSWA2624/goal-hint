import type { Metadata } from "next";
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
  const [data, plans] = db ? await Promise.all([
    createPaymentReview(db).codes().catch(() => null), plansServiceFor(db).list().catch(() => []),
  ]) : [null, []] as const;
  return <AdminFrame database={page.services.database}>
    {data ? <CodesEditor initialCodes={data} plans={plans} /> : <div><DeskHead><DeskTitle><h1>Codes</h1></DeskTitle></DeskHead><Notice $tone="error">Member storage is unavailable.</Notice></div>}
  </AdminFrame>;
}
