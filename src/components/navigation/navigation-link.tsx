"use client";

import NextLink, { useLinkStatus } from "next/link";
import type { ComponentPropsWithRef } from "react";

/** Uses the router's real lifecycle, including cancelled and superseded navigations. */
function PendingNavigation() {
  const { pending } = useLinkStatus();
  return <span hidden data-navigation-pending={pending ? "" : undefined} />;
}

/** Preserve native Link behaviour, prefetch policy, refs and modified clicks. */
export default function NavigationLink({ children, ...props }: ComponentPropsWithRef<typeof NextLink>) {
  return <NextLink {...props}>{children}<PendingNavigation /></NextLink>;
}
