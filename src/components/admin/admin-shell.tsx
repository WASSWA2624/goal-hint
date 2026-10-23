import "server-only";

import type { ComponentProps } from "react";
import { PublicShell } from "@/app/_components/public-shell";
import { AdminWorkspace } from "./admin-workspace";

/** All owner sections retain the shared site navigation above their dashboard tabs. */
export function AdminShell({ username, ...props }: ComponentProps<typeof AdminWorkspace> & { username: string }) {
  return <PublicShell locale="en" current="dashboard" administratorName={username} wide>
    <AdminWorkspace {...props} />
  </PublicShell>;
}
