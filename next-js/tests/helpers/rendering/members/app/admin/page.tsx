import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { fixtureAdminServices } from "../fixture-admin";
import { createMessages } from "@/i18n/messages";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await adminPageGate(searchParams, { services: fixtureAdminServices });
  if (!gate.owner) redirectToAccountLogin();
  return <main data-fixture-admin><h1>Synthetic administrator dashboard</h1><p>The production page gate accepted the current member session.</p>
    <form method="post" action="/api/account/sign-out"><button type="submit">{createMessages("en").text("auth.signOut")}</button></form></main>;
}
