import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminFrame } from "@/app/_components/admin-frame";
import { DeskHead } from "@/components/admin/desk-styles";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { adminPageGate } from "@/server/admin/admin-http";
import { settingsView } from "@/server/admin/settings-http";
import { settingsServiceFor } from "@/server/members/settings";

export const metadata: Metadata = { title: "Settings · Admin · Goal Hint" };

/** Server-side gate, then the stored settings (uncached) and the address headers this request carried. */
export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const { database } = page.services;
  const view = database ? await settingsView(settingsServiceFor(database), await headers()).catch(() => null) : null;
  return (
    <AdminFrame database={page.services.database}>
      <DeskHead><h1>Settings</h1></DeskHead>
      {view ? <SettingsEditor initial={view} username={page.owner.username} sessionAuthorized={!!page.owner.memberAccountId} />
        : <Notice $tone="error" role="alert">Settings are unavailable because the database cannot be read. Paid access stays as it was.</Notice>}
    </AdminFrame>
  );
}
