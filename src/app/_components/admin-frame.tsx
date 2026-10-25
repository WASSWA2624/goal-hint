import "server-only";

import type { ComponentProps } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import type { DatabaseRuntime } from "@/server/database/client";
import { createSubscribers } from "@/server/admin/subscribers";

/**
 * The admin shell with its section counts. Pages render it only after the owner gate passed; a page that already read
 * the open password requests passes their count instead of a second read.
 */
export async function AdminFrame({ database, passwordRequests, ...props }: Omit<ComponentProps<typeof AdminShell>, "passwordRequests"> & {
  database: DatabaseRuntime | null | undefined;
  passwordRequests?: number | null;
}) {
  const requests = passwordRequests !== undefined ? passwordRequests
    : database ? await createSubscribers(database).passwordResetRequests().then(rows => rows.length, () => null) : null;
  return <AdminShell {...props} passwordRequests={requests} />;
}
