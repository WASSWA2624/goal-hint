import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminDisplayName } from "@/domain/admin-identity";
import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { readPasswordRequestCount } from "@/app/_components/admin-frame";
import { OnlineRuntime } from "@/app/_components/online-runtime";
import { FallbackStyleProvider } from "@/styles/provider";

/** Both /admin and /analytics retain the same workspace; each page also enforces its own access gate. */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const page = await adminPageGate();
  if (!page.owner) redirectToAccountLogin();
  return <FallbackStyleProvider><AdminShell username={adminDisplayName(page.owner)} passwordRequests={await readPasswordRequestCount(page.services.database)}>
    {children}
    <OnlineRuntime />
  </AdminShell></FallbackStyleProvider>;
}
