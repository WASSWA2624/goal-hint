"use client";

import type { ComponentType, ReactNode } from "react";
import type { IconProps } from "@/components/ui/icons";
import { AccountCardHeading } from "./account-styles";

/** One title hierarchy for credentials, verification and password recovery. */
export function AccountFormHeader({ icon: Icon, title, description, actions }: {
  icon: ComponentType<IconProps>; title: string; description?: ReactNode; actions?: ReactNode;
}) {
  return <AccountCardHeading><Icon /><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions}</AccountCardHeading>;
}
