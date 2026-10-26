import "server-only";

import { cache, type ReactNode } from "react";
import { AdminPageState } from "@/components/admin/admin-page-state";
import type { DatabaseRuntime } from "@/server/database/client";
import { createSubscribers } from "@/server/admin/subscribers";

/** Request-scoped deduplication between the persistent layout and its authorized page. */
export const readPasswordRequests = cache((database: DatabaseRuntime) => createSubscribers(database).passwordResetRequests().catch(() => null));

export async function readPasswordRequestCount(database: DatabaseRuntime | null | undefined) {
  return database ? (await readPasswordRequests(database))?.length ?? null : null;
}

/** Pages refresh badge data while their shared shell remains in the owner layout. */
export async function AdminFrame({ database, passwordRequests, pendingCount, children }: {
  database: DatabaseRuntime | null | undefined;
  children: ReactNode;
  pendingCount?: number;
  passwordRequests?: number | null;
}) {
  const requests = passwordRequests !== undefined ? passwordRequests
    : await readPasswordRequestCount(database);
  return <><AdminPageState passwordRequests={requests} {...(pendingCount !== undefined ? { pendingCount } : {})} />{children}</>;
}
