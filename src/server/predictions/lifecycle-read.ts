import "server-only";

import { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson, historyTime } from "./history-read.ts";
import { historyHash, historyId, historyInstant } from "./history-input.ts";
import { lifecycleFail, type LifecycleReceipt } from "./lifecycle-contract.ts";
import { lifecycleObservationSchema, parseLifecycle } from "./lifecycle-input.ts";

const receiptSchema = z.strictObject({ id: historyHash, fixtureId: historyId, cycleId: historyId.nullable(),
  fixtureVersion: z.bigint().positive().max(18_446_744_073_709_551_615n), at: historyInstant,
  outcome: z.enum(["accepted", "unchanged", "stale", "conflict"]), reason: z.string().min(1).max(128),
  policyHash: historyHash, observation: lifecycleObservationSchema });
export async function storedLifecycleReceipt(tx: Prisma.TransactionClient, id: string): Promise<LifecycleReceipt | null> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT *, integrity = SHA2(CAST(receiptJson AS CHAR), 256) AS validIntegrity
    FROM FixtureLifecycleObservation WHERE id = ${id}`;
  const row = rows[0]; if (!row) return null;
  try {
    assertHistorySeal(row.validIntegrity);
    const value = parseLifecycle(receiptSchema, historyJson(row.receiptJson));
    for (const key of ["id", "fixtureId", "cycleId", "fixtureVersion", "outcome", "reason"] as const)
      if (row[key] !== value[key]) return lifecycleFail("unavailable");
    if (value.observation.fixtureId !== value.fixtureId || historyTime(row.at) !== value.at ||
      historyTime(row.retrievedAt) !== value.observation.retrievedAt || value.at < value.observation.retrievedAt)
      return lifecycleFail("unavailable");
    return freezeEvidence(value);
  } catch { return lifecycleFail("unavailable"); }
}
