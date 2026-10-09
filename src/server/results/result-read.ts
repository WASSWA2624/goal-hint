import "server-only";

import { z } from "zod";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { historyHash, historyId, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";

export const resultStatus = z.enum(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties",
  "postponed", "canceled", "abandoned", "awarded", "unknown"]);
const goal = z.number().int().min(0).max(1000), pair = z.strictObject({ home: goal.nullable(), away: goal.nullable() });
const resultSchema = z.strictObject({ id: historyHash, fixtureId: historyId, fixtureVersion: z.bigint().positive(),
  previousId: historyHash.nullable(), observationId: historyHash, observedAt: historyInstant,
  providerUpdatedAt: historyInstant.nullable(), regulationVerifiedAt: historyInstant.nullable(), status: resultStatus,
  providerStatus: z.string().max(32).nullable(), elapsedMinutes: z.number().int().nonnegative().nullable(),
  reportedGoals: pair, extraTimeScore: pair, penaltyScore: pair,
  regulation: z.strictObject({ verified: z.boolean(), home: goal.nullable(), away: goal.nullable(), evidenceRef: z.string().min(1).max(512).nullable() }),
}).refine((v) => v.regulation.verified
  ? v.regulation.home !== null && v.regulation.away !== null && v.regulation.evidenceRef !== null && v.regulationVerifiedAt !== null && v.regulationVerifiedAt <= v.observedAt
  : v.regulation.home === null && v.regulation.away === null && v.regulation.evidenceRef === null && v.regulationVerifiedAt === null);
export type StoredFixtureResult = Readonly<z.infer<typeof resultSchema>>;

/** Read the sealed, append-only version; canonical/live goal fields are never evidence. */
export async function storedFixtureResult(tx: Prisma.TransactionClient, fixtureId: string, id: string): Promise<StoredFixtureResult> {
  const row = await tx.fixtureResult.findUnique({ where: { id } });
  if (!row || row.fixtureId !== fixtureId) return historyFail("invalid-state");
  const [seal] = await tx.$queryRaw<{ validIntegrity: bigint }[]>`SELECT integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM FixtureResult WHERE id = ${id}`;
  assertHistorySeal(seal?.validIntegrity);
  const parsed = resultSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const v = parsed.data;
  const content = { status: v.status, providerStatus: v.providerStatus, elapsedMinutes: v.elapsedMinutes,
    reportedGoals: v.reportedGoals, extraTimeScore: v.extraTimeScore, penaltyScore: v.penaltyScore, regulation: v.regulation };
  if (v.id !== id || v.fixtureId !== fixtureId || v.fixtureVersion !== row.fixtureVersion || v.observedAt !== row.observedAt.getTime() ||
      v.status !== row.status || v.regulation.verified !== row.regulationVerified || v.regulation.home !== row.regulationHome ||
      v.regulation.away !== row.regulationAway || evidenceFingerprint(content) !== row.contentHash) return historyFail("invalid-state");
  return freezeEvidence(v);
}
