import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { MonitoringError, monitoringFail, parseMonitoring } from "./monitoring-contract.ts";
import { monitoringStateSchema, type MonitoringStore } from "./monitoring-alerts.ts";

export function createMysqlMonitoringStore(database: DatabaseRuntime): MonitoringStore {
  return Object.freeze({ async transaction(operation) {
    let refusal: MonitoringError | undefined;
    try {
      return await database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ stateJson: unknown; at: Date }[]>`SELECT stateJson, UTC_TIMESTAMP(3) AS at
          FROM OperationsMonitorState WHERE id = 1 FOR UPDATE`;
        if (rows.length !== 1) monitoringFail("unavailable");
        const state = structuredClone(parseMonitoring(monitoringStateSchema, rows[0]!.stateJson));
        let result;
        try { result = await operation(state, rows[0]!.at.getTime()); }
        catch (error) { if (error instanceof MonitoringError) refusal = error; throw error; }
        const parsed = parseMonitoring(monitoringStateSchema, state);
        if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > 131_072) monitoringFail("invalid-input");
        await tx.operationsMonitorState.update({ where: { id: 1 }, data: { stateJson: parsed as Prisma.InputJsonValue } });
        return result;
      }, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 5000 });
    } catch { if (refusal) throw refusal; return monitoringFail("unavailable"); }
  } });
}
