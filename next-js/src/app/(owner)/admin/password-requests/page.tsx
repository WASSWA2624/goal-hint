import type { Metadata } from "next";
import { PasswordRequestsEditor } from "@/components/admin/password-requests-editor";
import { adminPageGate } from "@/server/admin/admin-http";
import { readAdminPasswordRequests } from "@/server/admin/password-requests-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";

export const metadata: Metadata = { title: "Password Requests · Admin · Goal Hint" };

export default async function AdminPasswordRequestsPage() {
  const page = await adminPageGate();
  if (!page.owner) redirectToAccountLogin();
  const initial = await readAdminPasswordRequests(page.services).catch(() => null);
  return <PasswordRequestsEditor initial={initial} />;
}
