import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { PlansEditor } from "@/components/admin/plans-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { plansServiceFor } from "@/server/members/plans";

export const metadata: Metadata = { title: "Plans · Admin · Goal Hint" };

/** Server-side gate, then the stored plans, rendered before any script runs. The editor owns the title row and its live count. */
export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  const plans = database ? await plansServiceFor(database).list().catch(() => null) : null;
  return (
    <AdminFrame database={page.services.database} current="plans" username={adminDisplayName(page.owner)}>
      {plans ? <PlansEditor initialPlans={plans} /> : <>
        <DeskHead><DeskTitle><h1>Plans</h1><p>Length and price of each paid period</p></DeskTitle></DeskHead>
        <Notice $tone="error" role="alert">Plans are unavailable because the database cannot be read. Try again shortly.</Notice>
      </>}
    </AdminFrame>
  );
}
