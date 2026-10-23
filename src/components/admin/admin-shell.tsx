import "server-only";

import type { ComponentProps } from "react";
import { PublicShell } from "@/app/_components/public-shell";
import { AdminWorkspace } from "./admin-workspace";

/** All owner sections retain the shared site navigation above their dashboard tabs. */
export function AdminShell(props: ComponentProps<typeof AdminWorkspace>) {
  return <PublicShell locale="en" current="dashboard" wide>
    <AdminWorkspace {...props} />
  </PublicShell>;
}
