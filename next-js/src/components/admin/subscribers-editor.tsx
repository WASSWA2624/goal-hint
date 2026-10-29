"use client";

import type { ComponentProps } from "react";
import { SubscribersWorkspace } from "./subscriber-workspace";

/** All subscriber entry points share the approved directory, record and dialog workspace. */
export function SubscribersEditor(props: ComponentProps<typeof SubscribersWorkspace>) {
  return <SubscribersWorkspace {...props} />;
}
