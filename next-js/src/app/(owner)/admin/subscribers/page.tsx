import type { Metadata } from "next";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { DeskHead } from "@/components/admin/desk-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";
import { readSubscriberDirectory } from "@/server/admin/subscriber-directory";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryQuery } from "@/domain/subscriber-directory";
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
  const query = parseSubscriberDirectoryQuery(Object.fromEntries(["search", "status", "access", "plan", "recent"].map(key => [key, params[key] ?? emptySubscriberDirectoryQuery[key as keyof typeof emptySubscriberDirectoryQuery]]))) ?? emptySubscriberDirectoryQuery;
  const data = db ? await Promise.all([readSubscriberDirectory(db, query), plansServiceFor(db).list()]).then(async ([accounts, plans]) => {
    const selectedId = id ?? accounts[0]?.id;
    return { accounts, plans, detail: selectedId ? await createSubscribers(db).detail(selectedId).catch(() => null) : null };
  }).catch(() => null) : null;
  return data ? <SubscribersEditor accounts={data.accounts} detail={data.detail} plans={data.plans} initialQuery={query} selectedExplicitly={!!id} />
    : <><DeskHead><h1>Subscribers</h1></DeskHead><Notice $tone="error">Member storage is unavailable.</Notice></>;
}
