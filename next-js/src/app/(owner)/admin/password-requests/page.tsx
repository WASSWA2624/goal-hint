import type { Metadata } from "next";
import { PasswordRequestsEditor } from "@/components/admin/password-requests-editor";
import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { uuid } from "@/server/admin/codes-http";

export const metadata: Metadata = { title: "Password Requests · Admin · Goal Hint" };

export default async function AdminPasswordRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { requestId } = await searchParams;
  const selected = page.owner.memberAccountId && uuid(requestId) ? requestId : null;
  return <PasswordRequestsEditor key={selected ?? ""} {...(selected ? { initialRequestId: selected } : {})} />;
}
