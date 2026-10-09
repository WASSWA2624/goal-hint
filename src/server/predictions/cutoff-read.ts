import "server-only";

import { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { cutoffFail, type CutoffOperation, type CutoffResult } from "./cutoff-contract.ts";
import { parseCutoff } from "./cutoff-input.ts";
import { historyHash, historyId, historyInstant, parseStoredCycle } from "./history-input.ts";
import { assertHistorySeal, historyJson, historyTime, storedRevision } from "./history-read.ts";

const operationSchema = z.strictObject({ id: historyHash, fixtureId: historyId, cycleId: historyId,
  kind: z.enum(["close", "void"]), fixtureVersion: z.bigint().positive().max(18_446_744_073_709_551_615n),
  at: historyInstant, effectiveCloseAt: historyInstant, actor: z.string().min(1).max(128),
  reason: z.string().min(1).max(2000), evidenceRef: z.string().min(1).max(512), scheduleHash: historyHash, cycle: z.unknown() });
export async function storedCutoffOperation(tx: Prisma.TransactionClient, cycleId: string, kind: "close" | "void"): Promise<CutoffOperation | null> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT *, integrity = SHA2(CAST(operationJson AS CHAR), 256) AS validIntegrity
    FROM PredictionCycleOperation WHERE cycleId = ${cycleId} AND kind = ${kind}`;
  const row = rows[0]; if (!row) return null;
  try {
    assertHistorySeal(row.validIntegrity);
    const value = parseCutoff(operationSchema, historyJson(row.operationJson)), cycle = parseStoredCycle(value.cycle);
    for (const key of ["id", "fixtureId", "cycleId", "kind", "fixtureVersion"] as const)
      if (row[key] !== value[key]) return cutoffFail("unavailable");
    if (historyTime(row.at) !== value.at || row.revisionId !== cycle.lockedSetId || cycle.id !== value.cycleId ||
      cycle.fixtureId !== value.fixtureId || cycle.state !== (kind === "close" ? "closed" : "void") ||
      cycle.closedAt === null || cycle.closedAt < value.effectiveCloseAt || value.effectiveCloseAt > value.at)
      return cutoffFail("unavailable");
    return freezeEvidence({ ...value, cycle });
  } catch { return cutoffFail("unavailable"); }
}
export async function cutoffResult(tx: Prisma.TransactionClient, operation: CutoffOperation): Promise<CutoffResult> {
  const id = operation.cycle.lockedSetId, revision = id === null ? null : await storedRevision(tx, id);
  if (id !== null && (!revision || revision.cycleId !== operation.cycleId || revision.fixtureId !== operation.fixtureId)) return cutoffFail("unavailable");
  return freezeEvidence({ operation, revision });
}
