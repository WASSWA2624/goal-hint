import { Suspense, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminDisplayName } from "@/domain/admin-identity";
import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { OnlineRuntime } from "@/app/_components/online-runtime";
import { FallbackStyleProvider, ServerThemeUntilHydrated } from "@/styles/provider";
import { PageContentLoading } from "@/components/navigation/page-loading";
import { createMessages } from "@/i18n/messages";

/** Both /admin and /analytics retain the same workspace; each page also enforces its own access gate. */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const page = await adminPageGate();
  if (!page.owner) redirectToAccountLogin();
  return <FallbackStyleProvider><AdminShell username={adminDisplayName(page.owner)}>
    <Suspense fallback={<PageContentLoading label={createMessages("en").text("navigation.loading")} />}>
      <ServerThemeUntilHydrated>{children}</ServerThemeUntilHydrated>
    </Suspense>
    <OnlineRuntime />
  </AdminShell></FallbackStyleProvider>;
}
