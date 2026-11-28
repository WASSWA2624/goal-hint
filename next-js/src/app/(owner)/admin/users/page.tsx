import type { Metadata } from "next";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { adminPageGate } from "@/server/admin/admin-http";
import { readUserWorkspace } from "@/server/admin/user-workspace";
import { emptyUserDirectoryQuery, parseUserDirectoryPage, parseUserDirectoryQuery } from "@/domain/user-directory";
import { parseUserIndividualAction } from "@/domain/user-actions";
import { UsersEditor } from "@/components/admin/users-editor";
import { uuid } from "@/server/admin/codes-http";
export const metadata: Metadata = { title: "Users · Admin · Goal Hint" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId.toLowerCase() : null, initialAction = id ? parseUserIndividualAction(params.action) : null;
  const query = parseUserDirectoryQuery(Object.fromEntries(["search", "status", "access", "plan", "recent"].map(key => [key, params[key] ?? emptyUserDirectoryQuery[key as keyof typeof emptyUserDirectoryQuery]]))) ?? emptyUserDirectoryQuery;
  const data = await readUserWorkspace(db, query, parseUserDirectoryPage(params.page) ?? 1, id);
  return <UsersEditor {...data} initialQuery={query}
    canManagePasswords={!!page.owner.memberAccountId} {...(initialAction ? { initialAction } : {})} />;
}
