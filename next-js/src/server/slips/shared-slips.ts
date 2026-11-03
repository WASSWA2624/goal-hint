import "server-only";

import { sharedSlipIdSchema, sharedSlipUrl, type SharedSlip } from "../../domain/shared-slips.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { readSlipForecastResults } from "./slip-forecast.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { slipSnapshotSchema, slipCompleted, slipSnapshotStatus } from "../../domain/slip-snapshot.ts";
import { slipMatchStatesFromResults } from "../../domain/slip-match-state.ts";
import { readWithSlipAccess } from "./slip-access.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import type { BuiltSlip } from "../../domain/slip-builder.ts";

export type SharedSlipLanding = Readonly<{ state: "available"; shared: SharedSlip }> | Readonly<{ state: "restricted" | "missing" }>;

/** Existing links continue reading their original sealed snapshot, including custom slips. */
export function createSharedSlips(database: DatabaseRuntime, { resolveResults = readSlipForecastResults } = {}) {
  return Object.freeze({
    async read(id: string, entitled = false): Promise<SharedSlip | null> {
      const result = await this.landing(id, entitled);
      return result.state === "available" ? result.shared : null;
    },
    async landing(id: string, entitled = false): Promise<SharedSlipLanding> {
      if (!sharedSlipIdSchema.safeParse(id).success) return { state: "missing" };
      return database.transaction(async tx => {
        const [row] = await tx.$queryRaw<{ id: string; createdAt: Date; snapshotJson: unknown; validIntegrity: unknown }[]>`
          SELECT id,createdAt,snapshotJson,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity FROM SharedSlip WHERE id=${id} LIMIT 1`;
        if (!row) return { state: "missing" };
        assertHistorySeal(row.validIntegrity);
        const slip = slipSnapshotSchema.parse(historyJson(row.snapshotJson)) as BuiltSlip;
        const results = await resolveResults(tx, slip.selections, Date.now());
        if (!entitled && !slipCompleted(slip, results)) return { state: "restricted" };
        const states = slipMatchStatesFromResults(slip.selections, results);
        return { state: "available", shared: { id, url: sharedSlipUrl(id), createdAt: row.createdAt.toISOString(), slip,
          status: slipSnapshotStatus(slip, results), selectionOutcomes: Object.fromEntries(states.map(leg => [leg.fixtureId, leg.outcome])),
          selectionScores: Object.fromEntries(states.flatMap(leg => leg.score ? [[leg.fixtureId, leg.score]] : [])) } };
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    },
  });
}

export async function readSharedSlip(id: string, access?: ViewerAccess): Promise<SharedSlip | null> {
  if (!sharedSlipIdSchema.safeParse(id).success) return null;
  const { database } = await getAnalyticsServices();
  if (!database) throw new Error("Published slip storage is unavailable.");
  const read = (viewer: ViewerAccess) => createSharedSlips(database).read(id, viewer.tier === "full");
  return access ? read(access) : readWithSlipAccess(read);
}

export async function readSharedSlipLanding(id: string): Promise<{ result: SharedSlipLanding; access: ViewerAccess }> {
  if (!sharedSlipIdSchema.safeParse(id).success) return { result: { state: "missing" }, access: { tier: "free", signedIn: false, mode: "free" } };
  const { database } = await getAnalyticsServices();
  if (!database) throw new Error("Published slip storage is unavailable.");
  return readWithSlipAccess(async access => ({ access, result: await createSharedSlips(database).landing(id, access.tier === "full") }));
}
