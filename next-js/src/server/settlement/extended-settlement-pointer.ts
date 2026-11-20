import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";
import { historyFail } from "../predictions/history-contract.ts";

/** The caller holds the fixture lock. Only the revision column of an existing pointer is writable. */
export async function advanceExtendedSettlementPointer(tx: Prisma.TransactionClient,
  { fixtureId, cycleId, marketKey, revisionId, previousId }: Readonly<{
    fixtureId: string; cycleId: string; marketKey: string; revisionId: string; previousId: string | null;
  }>) {
  if (previousId === null) {
    await tx.$executeRaw`INSERT INTO ExtendedMarketSettlement (fixtureId, cycleId, marketKey, revisionId)
      VALUES (${fixtureId}, ${cycleId}, ${marketKey}, ${revisionId})`;
    return;
  }
  const updated = await tx.$executeRaw`UPDATE ExtendedMarketSettlement SET revisionId = ${revisionId}
    WHERE fixtureId = ${fixtureId} AND cycleId = ${cycleId} AND marketKey = ${marketKey} AND revisionId = ${previousId}`;
  if (updated !== 1) return historyFail("invalid-state");
}
