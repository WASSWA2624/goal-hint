import "server-only";

import { inPlayOddsBodySchema, inPlayOddsObservationSchema, type InPlayOddsObservation } from "../../domain/in-play-odds.ts";
import { reconcileOddsCatalog } from "../../domain/market-registry.ts";
import { resolveReferenceOdds, type ReferenceBookmakerPolicy, type ReferenceOddsOffer, type ReferenceOddsSelection }
  from "../../domain/reference-odds.ts";
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
      AND o.withdrawnAt IS NULL AND o.checkedAt BETWEEN ${new Date(asOf - inPlayOddsFreshMs)} AND ${new Date(asOf)}
      AND (o.providerUpdatedAt IS NULL OR o.providerUpdatedAt >= ${new Date(asOf - inPlayOddsFreshMs)})`);
  return rows.flatMap((row) => {
    try {
      const prices = inPlayOddsBodySchema.parse(typeof row.bodyJson === "string" ? JSON.parse(row.bodyJson) : row.bodyJson);
      if (prices.state === "unavailable") return [];
      return [inPlayOddsObservationSchema.parse({ fixtureId: row.fixtureId, kickoffAt: row.kickoffAt.getTime(),
        checkedAt: row.checkedAt.getTime(), providerUpdatedAt: row.providerUpdatedAt?.getTime() ?? null, prices,
        source: { provider: "api-football", sourceId: "api-football-live", bookmakerId: null },
        ...(prices.providerMarkets ? { version: row.semanticHash } : {}) })];
    } catch { return []; }
  });
}

/** Interpret the returned live source only when the catalog verifies the exact period and market identity. */
export function inPlayReferencePrice(observation: InPlayOddsObservation | null, selection: ReferenceOddsSelection,
  asOf: number, policy: ReferenceBookmakerPolicy = {}) {
  const offers: ReferenceOddsOffer[] = [];
  if (observation && observation.fixtureId === selection.fixtureId && selection.phase === "in-play" &&
    observation.prices.state === "available" && selection.playerId === null && selection.teamId === null) {
    const market = observation.prices.providerMarkets?.find(({ betId, name }) => betId === selection.marketId && name === selection.marketName);
    const [catalog] = reconcileOddsCatalog("in-play", market ? [{ id: market.betId, name: market.name }] : []);
    if (market && catalog?.status === "mapped" && catalog.mappings.some(({ period }) => period === selection.period)) {
      for (const { label, line, price } of market.selections) offers.push({ ...selection, label, line, price, state: "open",
        sourceId: observation.source?.sourceId ?? "api-football-live", bookmakerId: null, observedAt: observation.checkedAt,
        checkedAt: observation.checkedAt, providerUpdatedAt: observation.providerUpdatedAt });
    }
  }
  return resolveReferenceOdds(selection, offers, { ...policy, asOf, freshnessMs: inPlayOddsFreshMs });
}

export async function storedInPlayOdds(tx: Prisma.TransactionClient, scope: Readonly<{ fixtureId: string; kickoffAt: number; asOf: number }>)
  : Promise<InPlayOddsObservation | null> {
  const [row] = await storedInPlayOddsForFixtures(tx, [scope.fixtureId], scope.asOf, true);
  return row?.kickoffAt === scope.kickoffAt ? row : null;
}
