"use client";

import { useMemo, useSyncExternalStore, type ComponentProps } from "react";
import { getAdminSessionSnapshot, getServerAdminSessionSnapshot, subscribeMemberSession } from "@/components/members/member-session";
import { adminLandingPath } from "@/domain/admin-navigation";
import { ResponsiveNavigation, type NavigationDestination } from "./responsive-navigation";

/** Public HTML stays shared; the private session adds Dashboard to both navigation layouts. */
export function SessionNavigation({ destinations, dashboardLabel, ...props }:
  ComponentProps<typeof ResponsiveNavigation> & { dashboardLabel: string }) {
  const administrator = useSyncExternalStore(subscribeMemberSession, getAdminSessionSnapshot, getServerAdminSessionSnapshot);
  const items = useMemo<readonly NavigationDestination[]>(() => administrator ? [...destinations, {
    key: "dashboard", href: adminLandingPath, label: dashboardLabel, tab: dashboardLabel, icon: "dashboard", tone: "blue",
  }] : destinations, [administrator, destinations, dashboardLabel]);
  return <ResponsiveNavigation {...props} destinations={items} />;
}
