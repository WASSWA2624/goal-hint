"use client";

import type { ComponentProps } from "react";
import { UsersWorkspace } from "./user-workspace";

/** All user entry points share the approved directory, record and dialog workspace. */
export function UsersEditor(props: ComponentProps<typeof UsersWorkspace>) {
  return <UsersWorkspace {...props} />;
}
