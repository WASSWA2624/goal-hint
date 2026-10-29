import type { Metadata } from "next";
import { AdminFrame, readPasswordRequests } from "@/app/_components/admin-frame";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { PasswordResetRequests } from "@/components/admin/password-reset-requests";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";

export const metadata: Metadata = { title: "Password requests · Admin · Goal Hint" };

export default async function PasswordResetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const requests = page.services.database ? await readPasswordRequests(page.services.database) : null;
  return <AdminFrame database={page.services.database} passwordRequests={requests?.length ?? null}>
    {requests ? <PasswordResetRequests requests={requests} /> : <><DeskHead><DeskTitle><h1>Password requests</h1></DeskTitle></DeskHead><Notice $tone="error">Member storage is unavailable.</Notice></>}
  </AdminFrame>;
}
