import "server-only";

import type { ReactNode } from "react";
import { AdminPageState } from "@/components/admin/admin-page-state";

/** Seed a fresh payment count while the shared owner shell remains mounted. */
export function AdminFrame({ pendingCount, children }: {
  children: ReactNode;
  pendingCount?: number;
}) {
  return <>{pendingCount !== undefined && <AdminPageState pendingCount={pendingCount} />}{children}</>;
}
