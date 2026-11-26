import type { Metadata } from "next";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";
import { readSubscriberDirectory } from "@/server/admin/subscriber-directory";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryPage, parseSubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { parseSubscriberIndividualAction } from "@/domain/subscriber-actions";
import { SubscribersEditor } from "@/components/admin/subscribers-editor";
import { plansServiceFor } from "@/server/members/plans";
import { uuid } from "@/server/admin/codes-http";
export const metadata: Metadata = { title: "Subscribers · Admin · Goal Hint" };
/** The editor renders the h1 itself so it heads the directory column; the storage error keeps its own. */
export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId : null, initialAction = id ? parseSubscriberIndividualAction(params.action) : null;
  const query = parseSubscriberDirectoryQuery(Object.fromEntries(["search", "status", "access", "plan", "recent"].map(key => [key, params[key] ?? emptySubscriberDirectoryQuery[key as keyof typeof emptySubscriberDirectoryQuery]]))) ?? emptySubscriberDirectoryQuery;
  const directory = db ? readSubscriberDirectory(db, query, parseSubscriberDirectoryPage(params.page) ?? 1) : null;
  const detail = db && directory ? (id ? Promise.resolve(id) : directory.then((list) => list.accounts[0]?.id))
    .then((selectedId) => selectedId ? createSubscribers(db).detail(selectedId) : null).catch(() => null) : null;
  const data = db && directory ? await Promise.all([directory, plansServiceFor(db).list(), detail])
    .then(([directory, plans, detail]) => ({ directory, plans, detail })).catch(() => null) : null;
  if (data) {
    const { accounts, ...initialPaging } = data.directory;
    return <SubscribersEditor accounts={accounts} detail={data.detail} plans={data.plans} initialQuery={query} initialPaging={initialPaging}
      selectedExplicitly={!!id} canManagePasswords={!!page.owner?.memberAccountId} {...(initialAction ? { initialAction } : {})} />;
  }
  return <><VisuallyHidden as="h1">Subscribers</VisuallyHidden><Notice $tone="error">Member storage is unavailable.</Notice></>;
}
