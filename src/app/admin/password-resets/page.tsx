import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { AdminFrame } from "@/app/_components/admin-frame";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { PasswordResetRequests } from "@/components/admin/password-reset-requests";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { createSubscribers } from "@/server/admin/subscribers";

export const metadata: Metadata = { title: "Password requests · Admin · Goal Hint" };

export default async function PasswordResetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const requests = page.services.database ? await createSubscribers(page.services.database).passwordResetRequests().catch(() => null) : null;
  return <AdminFrame database={page.services.database} passwordRequests={requests?.length ?? null} current="password-resets" username={adminDisplayName(page.owner)}>
    <DeskHead><DeskTitle><h1>Password requests</h1><p>Verify the member by phone, then set a temporary password and read it to them.</p></DeskTitle></DeskHead>
    {requests ? <PasswordResetRequests requests={requests} /> : <Notice $tone="error">Member storage is unavailable.</Notice>}
  </AdminFrame>;
}
