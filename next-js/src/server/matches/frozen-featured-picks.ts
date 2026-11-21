import "server-only";

import { z } from "zod";
import { localFeaturedDecisionSchema, localFeaturedDecisionVersion, type LocalFeaturedDecision } from "../../domain/local-featured-decision.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { historyId, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";

export const frozenLocalFeaturedPickSchema = z.strictObject({
  fixtureId: historyId, cycleId: historyId, revisionId: historyId,
  homeTeamId: historyId, awayTeamId: historyId,
  kickoffAt: historyInstant, decisionAt: historyInstant, decision: localFeaturedDecisionSchema,
}).refine(({ homeTeamId, awayTeamId, kickoffAt, decisionAt, decision }) => homeTeamId !== awayTeamId &&
  decisionAt < kickoffAt && (decision.status !== "priced" ||
    decision.quote.checkedAt <= decisionAt && Boolean(decision.quote.snapshotId && decision.quote.receiptId)));

export type FrozenLocalFeaturedPick = Readonly<z.infer<typeof frozenLocalFeaturedPickSchema>>;
const sameOccurrenceVoidStatuses = ["canceled", "abandoned", "awarded"] as const;

export function eligibleFrozenFeaturedStatus(status: SettlementStatus, cycleState: string | undefined): boolean {
  return cycleState === "closed" && (status === "scheduled" || status === "live" || isPlayedFinalStatus(status)) ||
    cycleState === "void" && sameOccurrenceVoidStatuses.some((voidStatus) => voidStatus === status);
}

/** Read the active, locked occurrence in bulk, including an attributable void of that same occurrence. */
export async function readFrozenLocalFeaturedPicks(tx: Prisma.TransactionClient, fixtureIds: readonly string[]):
  Promise<ReadonlyMap<string, LocalFeaturedDecision>> {
  const picks = new Map<string, LocalFeaturedDecision>();
  for (let offset = 0; offset < fixtureIds.length; offset += 500) {
    const batch = fixtureIds.slice(offset, offset + 500);
    const rows = await tx.$queryRaw<{
      fixtureId: string; cycleId: string; revisionId: string; kickoffAt: Date; homeTeamId: string; awayTeamId: string;
      featuredDecisionJson: unknown; validDecision: unknown; validOperation: unknown; effectiveCloseAt: string; actualStartedAt: Date | null;
    }[]>(Prisma.sql`
      SELECT f.id AS fixtureId, c.id AS cycleId, o.revisionId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
        o.featuredDecisionJson, life.actualStartedAt,
        o.featuredDecisionIntegrity = SHA2(CAST(o.featuredDecisionJson AS CHAR CHARACTER SET utf8mb4), 256) AS validDecision,
        o.integrity = SHA2(CAST(o.operationJson AS CHAR), 256) AS validOperation,
        JSON_UNQUOTE(JSON_EXTRACT(o.operationJson, '$.effectiveCloseAt')) AS effectiveCloseAt
      FROM FootballFixture f
      JOIN PredictionCycle c ON c.id = f.activeCycleId AND c.fixtureId = f.id
      JOIN PredictionCycleOperation o ON o.cycleId = c.id AND o.fixtureId = f.id
        AND o.kind = 'close' AND o.revisionId = c.lockedSetId
      LEFT JOIN FixtureLifecycleState life ON life.fixtureId = f.id
      WHERE f.id IN (${Prisma.join(batch)}) AND o.featuredDecisionJson IS NOT NULL AND f.kickoff IS NOT NULL
        AND (c.state = 'closed' OR (c.state = 'void' AND f.status IN (${Prisma.join(sameOccurrenceVoidStatuses)})
          AND c.voidReason = CONCAT('fixture-', f.status)))
    `);
    for (const row of rows) {
      assertHistorySeal(row.validDecision);
      assertHistorySeal(row.validOperation);
      const pick = frozenLocalFeaturedPickSchema.parse(historyJson(row.featuredDecisionJson));
      if (pick.fixtureId !== row.fixtureId || pick.cycleId !== row.cycleId || pick.revisionId !== row.revisionId ||
        pick.decisionAt + 1 !== Number(row.effectiveCloseAt)) return historyFail("invalid-state");
      if (pick.kickoffAt !== row.kickoffAt.getTime() || pick.homeTeamId !== row.homeTeamId || pick.awayTeamId !== row.awayTeamId) continue;
      // Corrected earlier play invalidates the display decision even when
      // the original forecast was published early enough to stay locked.
      const decision = row.actualStartedAt && row.actualStartedAt.getTime() <= pick.decisionAt
        ? { version: localFeaturedDecisionVersion, status: "abstained", reason: "invalid-decision-time" } as const : pick.decision;
      picks.set(row.fixtureId, freezeEvidence(decision));
    }
  }
  return picks;
}
