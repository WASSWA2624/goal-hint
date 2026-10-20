import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsLogin } from "@/components/analytics/dashboard/analytics-login";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { ownerRoutes } from "@/server/admin/owner-auth";
import { createSubscribers } from "@/server/admin/subscribers";
import { SubscribersEditor } from "@/components/admin/subscribers-editor";
import { plansServiceFor } from "@/server/members/plans";
import { uuid } from "@/server/admin/codes-http";
export const metadata: Metadata = { title: "Subscribers · Admin · Goal Hint" };
export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) return <AnalyticsLogin {...page.login} action={ownerRoutes.login} title="Owner sign-in" />;
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId : null;
  const data = db ? await Promise.all([createSubscribers(db).search(), id ? createSubscribers(db).detail(id) : null, plansServiceFor(db).list()]).catch(() => null) : null;
  return <AdminShell current="subscribers" username={adminDisplayName(page.owner)} developmentCredentials={page.services.config.usingDevelopmentCredentials}><PageTitle><h1>Subscribers</h1></PageTitle>{data ? <SubscribersEditor owner={page.owner.username} accounts={data[0]} detail={data[1]} plans={data[2]} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}</AdminShell>;
}
