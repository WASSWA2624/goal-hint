import type { Metadata } from "next";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { adminPageGate } from "@/server/admin/admin-http";
import { readSubscriberWorkspace } from "@/server/admin/subscriber-workspace";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryPage, parseSubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { parseSubscriberIndividualAction } from "@/domain/subscriber-actions";
import { SubscribersEditor } from "@/components/admin/subscribers-editor";
import { uuid } from "@/server/admin/codes-http";
export const metadata: Metadata = { title: "Subscribers · Admin · Goal Hint" };

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId.toLowerCase() : null, initialAction = id ? parseSubscriberIndividualAction(params.action) : null;
  const query = parseSubscriberDirectoryQuery(Object.fromEntries(["search", "status", "access", "plan", "recent"].map(key => [key, params[key] ?? emptySubscriberDirectoryQuery[key as keyof typeof emptySubscriberDirectoryQuery]]))) ?? emptySubscriberDirectoryQuery;
  const data = await readSubscriberWorkspace(db, query, parseSubscriberDirectoryPage(params.page) ?? 1, id);
  return <SubscribersEditor {...data} initialQuery={query}
    canManagePasswords={!!page.owner.memberAccountId} {...(initialAction ? { initialAction } : {})} />;
}
