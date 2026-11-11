import "server-only";

import { inPlayOddsBodySchema, inPlayOddsObservationSchema, type InPlayOddsObservation } from "../../domain/in-play-odds.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export const inPlayOddsFreshMs = 90_000;
type Stored = { bodyJson: unknown; checkedAt: Date; providerUpdatedAt: Date | null };

export async function storedInPlayOdds(tx: Prisma.TransactionClient, scope: Readonly<{ fixtureId: string; kickoffAt: number; asOf: number }>)
  : Promise<InPlayOddsObservation | null> {
  const { fixtureId, kickoffAt, asOf } = scope;
  const [row] = await tx.$queryRaw<Stored[]>`SELECT o.bodyJson, o.checkedAt, o.providerUpdatedAt
    FROM FixtureInPlayOdds o JOIN FootballFixture f ON f.id = o.fixtureId AND f.kickoff = o.kickoffAt
      AND f.homeTeamId = o.homeTeamId AND f.awayTeamId = o.awayTeamId
    WHERE o.fixtureId = ${fixtureId} AND o.kickoffAt = ${new Date(kickoffAt)} AND f.status = 'live'
      AND o.withdrawnAt IS NULL AND o.checkedAt BETWEEN ${new Date(asOf - inPlayOddsFreshMs)} AND ${new Date(asOf)}`;
  if (!row) return null;
  const prices = inPlayOddsBodySchema.safeParse(typeof row.bodyJson === "string" ? JSON.parse(row.bodyJson) : row.bodyJson);
  if (!prices.success || prices.data.state === "unavailable") return null;
  return inPlayOddsObservationSchema.parse({ fixtureId, kickoffAt, checkedAt: row.checkedAt.getTime(),
    providerUpdatedAt: row.providerUpdatedAt?.getTime() ?? null, prices: prices.data });
}
