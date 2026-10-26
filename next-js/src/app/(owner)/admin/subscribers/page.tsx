import type { Metadata } from "next";
import { AdminFrame } from "@/app/_components/admin-frame";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { DeskHead } from "@/components/admin/desk-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";
import { SubscribersEditor } from "@/components/admin/subscribers-editor";
import { plansServiceFor } from "@/server/members/plans";
import { uuid } from "@/server/admin/codes-http";
export const metadata: Metadata = { title: "Subscribers · Admin · Goal Hint" };
/** The editor renders the h1 itself so it heads the directory column; the storage error keeps its own. */
export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId : null;
  const data = db ? await Promise.all([createSubscribers(db).search(), id ? createSubscribers(db).detail(id) : null, plansServiceFor(db).list()]).catch(() => null) : null;
  return <AdminFrame database={page.services.database}>{data ? <SubscribersEditor accounts={data[0]} detail={data[1]} plans={data[2]} />
    : <><DeskHead><h1>Subscribers</h1></DeskHead><Notice $tone="error">Member storage is unavailable.</Notice></>}</AdminFrame>;
}
