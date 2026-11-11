import "server-only";

import { inPlayOddsBodySchema, inPlayOddsObservationSchema, type InPlayOddsObservation } from "../../domain/in-play-odds.ts";
import { Prisma } from "../generated/prisma/client.ts";

export const inPlayOddsFreshMs = 90_000;
type Stored = { fixtureId: string; kickoffAt: Date; bodyJson: unknown; checkedAt: Date; providerUpdatedAt: Date | null; semanticHash: string };

export async function storedInPlayOddsForFixtures(tx: Prisma.TransactionClient, ids: readonly string[], asOf: number, includeProviderMarkets = false)
  : Promise<InPlayOddsObservation[]> {
  if (!ids.length) return [];
  const body = includeProviderMarkets ? Prisma.sql`o.bodyJson` : Prisma.sql`JSON_REMOVE(o.bodyJson, '$.providerMarkets')`;
  const rows = await tx.$queryRaw<Stored[]>(Prisma.sql`SELECT o.fixtureId, o.kickoffAt, ${body} AS bodyJson, o.checkedAt, o.providerUpdatedAt, o.semanticHash
    FROM FixtureInPlayOdds o JOIN FootballFixture f ON f.id = o.fixtureId AND f.kickoff = o.kickoffAt
      AND f.homeTeamId = o.homeTeamId AND f.awayTeamId = o.awayTeamId
    WHERE o.fixtureId IN (${Prisma.join(ids)}) AND f.status = 'live'
      AND o.withdrawnAt IS NULL AND o.checkedAt BETWEEN ${new Date(asOf - inPlayOddsFreshMs)} AND ${new Date(asOf)}`);
  return rows.flatMap((row) => {
    try {
      const prices = inPlayOddsBodySchema.parse(typeof row.bodyJson === "string" ? JSON.parse(row.bodyJson) : row.bodyJson);
      if (prices.state === "unavailable") return [];
      return [inPlayOddsObservationSchema.parse({ fixtureId: row.fixtureId, kickoffAt: row.kickoffAt.getTime(),
        checkedAt: row.checkedAt.getTime(), providerUpdatedAt: row.providerUpdatedAt?.getTime() ?? null, prices,
        ...(prices.providerMarkets ? { version: row.semanticHash } : {}) })];
    } catch { return []; }
  });
}

export async function storedInPlayOdds(tx: Prisma.TransactionClient, scope: Readonly<{ fixtureId: string; kickoffAt: number; asOf: number }>)
  : Promise<InPlayOddsObservation | null> {
  const [row] = await storedInPlayOddsForFixtures(tx, [scope.fixtureId], scope.asOf, true);
  return row?.kickoffAt === scope.kickoffAt ? row : null;
}
