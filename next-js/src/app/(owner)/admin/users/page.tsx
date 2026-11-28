import type { Metadata } from "next";
import { Suspense, type ComponentProps } from "react";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { adminPageGate } from "@/server/admin/admin-http";
import { readUserWorkspace } from "@/server/admin/user-workspace";
import { emptyUserDirectoryQuery, parseUserDirectoryPage, parseUserDirectoryQuery } from "@/domain/user-directory";
import { parseUserIndividualAction } from "@/domain/user-actions";
import { UsersEditor } from "@/components/admin/users-editor";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { Stack } from "@/components/ui/layout";
import { uuid } from "@/server/admin/codes-http";
import { LoadingTheme } from "@/styles/loading-theme";
export const metadata: Metadata = { title: "Users · Admin · Goal Hint" };

async function UsersContent({ data, ...props }: Pick<ComponentProps<typeof UsersEditor>,
  "initialQuery" | "initialAction" | "canManagePasswords"> & { data: ReturnType<typeof readUserWorkspace> }) {
  return <UsersEditor {...await data} {...props} />;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const params = await searchParams, db = page.services.database;
  const id = uuid(params.accountId) ? params.accountId.toLowerCase() : null, initialAction = id ? parseUserIndividualAction(params.action) : null;
  const query = parseUserDirectoryQuery(Object.fromEntries(["search", "status", "access", "plan", "recent"].map(key => [key, params[key] ?? emptyUserDirectoryQuery[key as keyof typeof emptyUserDirectoryQuery]]))) ?? emptyUserDirectoryQuery;
  const data = readUserWorkspace(db, query, parseUserDirectoryPage(params.page) ?? 1, id);
  return <Suspense fallback={<LoadingTheme><Stack $gap="sm" data-users-loading aria-busy="true">
    <Notice role="status">{id ? "Loading users and the selected account…" : "Loading users…"}</Notice>
  </Stack></LoadingTheme>}>
    <UsersContent data={data} initialQuery={query}
      canManagePasswords={!!page.owner.memberAccountId} {...(initialAction ? { initialAction } : {})} />
  </Suspense>;
}
