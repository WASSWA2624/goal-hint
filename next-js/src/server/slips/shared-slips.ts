import "server-only";

import { slipCompleted, slipSnapshotSchema } from "../../domain/slip-snapshot.ts";
import { sharedSlipIdSchema, sharedSlipSchema, sharedSlipUrl, type SharedSlip } from "../../domain/shared-slips.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { readSlipForecastResults } from "./slip-forecast.ts";
import { readWithSlipAccess } from "./slip-access.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";

export type SharedSlipLanding = Readonly<{ state: "available"; shared: SharedSlip }> | Readonly<{ state: "restricted" | "missing" }>;
type Row = { id: string; createdAt: Date; snapshotJson: unknown; validIntegrity: unknown };
function publicRecord(row: Row): SharedSlip {
  assertHistorySeal(row.validIntegrity);
  return sharedSlipSchema.parse({ id: row.id, url: sharedSlipUrl(row.id), createdAt: row.createdAt.toISOString(),
    slip: slipSnapshotSchema.parse(historyJson(row.snapshotJson)) });
}

/** Previously shared public snapshots remain readable; no new personal snapshots are retained. */
export function createSharedSlips(database: DatabaseRuntime, { resolveResults = readSlipForecastResults } = {}) {
  return Object.freeze({
    async read(id: string, entitled = false): Promise<SharedSlip | null> {
      const result = await this.landing(id, entitled);
      return result.state === "available" ? result.shared : null;
    },
    async landing(id: string, entitled = false): Promise<SharedSlipLanding> {
      if (!sharedSlipIdSchema.safeParse(id).success) return { state: "missing" };
      return database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<Row[]>`SELECT id,createdAt,snapshotJson,
          integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity FROM SharedSlip WHERE id=${id} LIMIT 1`;
        if (!rows[0]) return { state: "missing" } as const;
        const shared = publicRecord(rows[0]);
        if (!entitled && !slipCompleted(shared.slip, await resolveResults(tx, shared.slip.selections, Date.now()))) return { state: "restricted" } as const;
        return { state: "available", shared } as const;
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    },
  });
}

export async function readSharedSlip(id: string, access?: ViewerAccess): Promise<SharedSlip | null> {
  if (!sharedSlipIdSchema.safeParse(id).success) return null;
  const { database } = await getAnalyticsServices();
  if (!database) throw new Error("Shared slip storage is unavailable.");
  const read = (viewer: ViewerAccess) => createSharedSlips(database).read(id, viewer.tier === "full");
  return access ? read(access) : readWithSlipAccess(read);
}

/** Restricted results expose only a state, never a snapshot or aggregate selection facts. */
export async function readSharedSlipLanding(id: string): Promise<{ result: SharedSlipLanding; access: ViewerAccess }> {
  if (!sharedSlipIdSchema.safeParse(id).success) return { result: { state: "missing" }, access: { tier: "free", signedIn: false, mode: "free" } };
  const { database } = await getAnalyticsServices();
  if (!database) throw new Error("Shared slip storage is unavailable.");
  return readWithSlipAccess(async access => ({ access, result: await createSharedSlips(database).landing(id, access.tier === "full") }));
}
