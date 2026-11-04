"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useEffect, type ComponentPropsWithRef } from "react";
import { interceptContextBack, rememberContextArrival, rememberContextOrigin } from "./context-history";

/** Uses the router's real lifecycle, including cancelled and superseded navigations. */
function PendingNavigation() {
  const { pending } = useLinkStatus();
  return <span hidden data-navigation-pending={pending ? "" : undefined} />;
}

function ContextArrival() {
  useEffect(rememberContextArrival, []);
  return null;
}

/** Preserve native Link behaviour, prefetch policy, refs and modified clicks. */
export default function NavigationLink({ children, contextBack = false, onNavigate, ...props }:
  ComponentPropsWithRef<typeof NextLink> & { contextBack?: boolean }) {
  return <NextLink {...props} replace={props.replace ?? contextBack} onNavigate={contextBack ? interceptContextBack : onNavigate ?? (() => {
    const href = props.as ?? props.href;
    if (!props.replace && typeof href === "string") rememberContextOrigin(href);
  })}>{children}{contextBack && <ContextArrival />}<PendingNavigation /></NextLink>;
}
