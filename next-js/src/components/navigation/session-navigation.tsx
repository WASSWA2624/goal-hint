"use client";

import { useMemo, useSyncExternalStore, type ComponentProps } from "react";
import { getAdminSessionSnapshot, getServerAdminSessionSnapshot, subscribeMemberSession } from "@/components/members/member-session";
import { dashboardDestination } from "./navigation-destinations";
import { ResponsiveNavigation, type NavigationDestination } from "./responsive-navigation";

/** Public HTML stays shared; the private session adds Dashboard to both navigation layouts. */
export function SessionNavigation({ destinations, dashboardLabel, ...props }:
  ComponentProps<typeof ResponsiveNavigation> & { dashboardLabel: string }) {
  const administrator = useSyncExternalStore(subscribeMemberSession, getAdminSessionSnapshot, getServerAdminSessionSnapshot);
  const items = useMemo<readonly NavigationDestination[]>(() => administrator
    ? [...destinations, dashboardDestination(dashboardLabel)] : destinations, [administrator, destinations, dashboardLabel]);
  return <ResponsiveNavigation {...props} destinations={items} />;
}
