import type { Metadata } from "next";
import { adminDisplayName } from "@/domain/admin-identity";
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
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
    <AdminShell current="settings" username={adminDisplayName(page.owner)}>
      <PageTitle><h1>Settings</h1><p>Paid access switch, payment numbers and limits</p></PageTitle>
      {view ? <SettingsEditor initial={view} username={page.owner.username} sessionAuthorized={!!page.owner.memberAccountId} />
        : <Notice $tone="error" role="alert">Settings are unavailable because the database cannot be read. Paid access stays as it was.</Notice>}
    </AdminShell>
  );
}
