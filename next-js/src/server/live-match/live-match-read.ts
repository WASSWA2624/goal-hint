import "server-only";

import { liveMatchRules, liveMatchSnapshotSchema, type LiveMatchSnapshot } from "../../domain/live-match.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export type LiveMatchReadScope = Readonly<{ fixtureId: string; cycleId: string | null; kickoffAt: number | null; asOf: number; historical?: boolean }>;
type SnapshotRow = { receivedAt: Date | null; bodyJson: unknown; sealed: boolean | number | bigint };

/** Reads the exact occurrence only. Missing, corrupt or unavailable enrichment never removes a forecast. */
export async function storedLiveMatchSnapshot(tx: Prisma.TransactionClient, scope: LiveMatchReadScope): Promise<LiveMatchSnapshot | null> {
  try {
    const rows = await tx.$queryRaw<SnapshotRow[]>`SELECT s.receivedAt, s.bodyJson,
      s.integrity = SHA2(CAST(s.bodyJson AS CHAR CHARACTER SET utf8mb4), 256) AS sealed
      FROM LiveMatchSnapshot s JOIN FootballFixture f ON f.id = s.fixtureId
        AND f.homeTeamId = s.homeTeamId AND f.awayTeamId = s.awayTeamId
      WHERE s.fixtureId = ${scope.fixtureId} AND s.cycleId <=> ${scope.cycleId}
        AND s.kickoffAt <=> ${scope.kickoffAt === null ? null : new Date(scope.kickoffAt)} AND s.bodyJson IS NOT NULL
        AND ((${scope.historical === true} AND s.cycleId IS NOT NULL AND EXISTS
          (SELECT 1 FROM PredictionCycle c WHERE c.id = s.cycleId AND c.fixtureId = s.fixtureId AND c.kickoffAt = s.kickoffAt))
          OR (${scope.historical !== true} AND f.activeCycleId <=> s.cycleId AND f.kickoff <=> s.kickoffAt)) LIMIT 2`;
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    if (![true, 1, 1n].includes(row.sealed) || !(row.receivedAt instanceof Date)) return null;
    const body: unknown = typeof row.bodyJson === "string" ? JSON.parse(row.bodyJson) : row.bodyJson;
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > liveMatchRules.maxSnapshotBytes) return null;
    const snapshot = liveMatchSnapshotSchema.parse(body);
    return snapshot.fixtureId === scope.fixtureId && snapshot.cycleId === scope.cycleId && snapshot.kickoffAt === scope.kickoffAt
      && snapshot.collectedAt === row.receivedAt.getTime() && snapshot.collectedAt <= scope.asOf ? snapshot : null;
  } catch { return null; }
}
