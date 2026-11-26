import type { Metadata } from "next";
import { PasswordRequestsEditor } from "@/components/admin/password-requests-editor";
import { adminPageGate } from "@/server/admin/admin-http";
import { readAdminPasswordRequests } from "@/server/admin/password-requests-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { uuid } from "@/server/admin/codes-http";

export const metadata: Metadata = { title: "Password Requests · Admin · Goal Hint" };

export default async function AdminPasswordRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { requestId } = await searchParams;
  const selected = page.owner.memberAccountId && uuid(requestId) ? requestId : null;
  const initial = await readAdminPasswordRequests(page.services).catch(() => null);
  return <PasswordRequestsEditor key={selected ?? ""} initial={initial} {...(selected ? { initialRequestId: selected } : {})} />;
}
