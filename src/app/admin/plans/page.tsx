import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminShell } from "@/components/admin/admin-shell";
import { PlansEditor } from "@/components/admin/plans-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { plansServiceFor } from "@/server/members/plans";

export const metadata: Metadata = { title: "Plans · Admin · Goal Hint" };

/** Server-side gate, then the stored plans, rendered before any script runs. */
export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  const plans = database ? await plansServiceFor(database).list().catch(() => null) : null;
  return (
    <AdminShell current="plans" username={adminDisplayName(page.owner)}>
      <PageTitle><h1>Plans</h1><p>Length and price of each paid period</p></PageTitle>
      {plans ? <PlansEditor initialPlans={plans} />
        : <Notice $tone="error" role="alert">Plans are unavailable because the database cannot be read. Try again shortly.</Notice>}
    </AdminShell>
  );
}
