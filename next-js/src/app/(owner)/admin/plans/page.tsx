import type { Metadata } from "next";
import { AdminFrame } from "@/app/_components/admin-frame";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { PlansEditor } from "@/components/admin/plans-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { plansServiceFor } from "@/server/members/plans";
import { uuid } from "@/server/admin/codes-http";

export const metadata: Metadata = { title: "Plans · Admin · Goal Hint" };

/** Server-side gate, then the stored plans, rendered before any script runs. The editor owns the title row and its live count. */
export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  const params = await searchParams, planId = uuid(params.planId) ? params.planId : undefined;
  const plans = database ? await plansServiceFor(database).list().catch(() => null) : null;
  if (plans && params.planId !== undefined && (!planId || !plans.some(plan => plan.id === planId))) {
    return <AdminFrame database={page.services.database}><DeskHead><h1>Plans</h1></DeskHead><Notice $tone="error">This plan is unavailable.</Notice></AdminFrame>;
  }
  return <AdminFrame database={page.services.database}>{plans ? <PlansEditor key={planId ?? "all"} initialPlans={plans} {...(planId ? { initialSelectedId: planId } : {})} /> : <div>
    <DeskHead><DeskTitle><h1>Plans</h1><p>Length and price of each paid period</p></DeskTitle></DeskHead>
    <Notice $tone="error" role="alert">Plans are unavailable because the database cannot be read. Try again shortly.</Notice>
  </div>}</AdminFrame>;
}
