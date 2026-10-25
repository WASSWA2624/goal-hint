import "server-only";

import type { FixturePrice } from "../../domain/fixture-snapshot.ts";
import type { DetailOddsGroup } from "../../domain/match-detail.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { formatOddsHundredths } from "../../domain/odds.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyTime } from "../predictions/history-read.ts";

type Tx = Prisma.TransactionClient;
/** Feed join: 1:1 by the projection's primary key, on exactly the shown pick's family and selection, fresh rows only.
 * Aliases: f = FootballFixture, m = the shown MarketPrediction, op = its price. */
export const oddsPriceJoin = Prisma.sql`LEFT JOIN FixtureOddsPrice op ON op.fixtureId=f.id AND op.marketKey=m.family
      AND op.selection=m.selection AND op.stale=FALSE`;

type PriceRow = { marketKey: string; selection: string; basis: string; displayHundredths: unknown; impliedProbability: string;
  overround: string; method: string; snapshotId: string | null; retrievedAt: Date; providerUpdatedAt: Date | null };
async function freshRows(tx: Tx, fixtureId: string): Promise<PriceRow[]> {
  return tx.$queryRaw<PriceRow[]>`SELECT marketKey, selection, basis, displayHundredths, CAST(impliedProbability AS CHAR) AS impliedProbability,
    CAST(overround AS CHAR) AS overround, method, snapshotId, retrievedAt, providerUpdatedAt
    FROM FixtureOddsPrice WHERE fixtureId = ${fixtureId} AND stale = FALSE ORDER BY marketKey, selection`;
}
const isBasis = (value: string): value is FixturePrice["basis"] => value === "bookmaker" || value === "median";

/** Prices for the given published picks, by the same rule as the feed SQL join: exact family and selection,
 * fresh rows only, no fallback. Empty while provider odds are not publicly enabled. */
export async function storedFixturePrices(tx: Tx, fixtureId: string, picks: readonly Readonly<{ family: MarketFamily; selection: string }>[],
  enabled: boolean = publicPolicy.features.providerOdds): Promise<FixturePrice[]> {
  if (!enabled || picks.length === 0) return [];
  const rows = await freshRows(tx, fixtureId), prices: FixturePrice[] = [];
  for (const family of publicPolicy.markets) {
    const pick = picks.find((item) => item.family === family);
    const row = pick && rows.find((item) => item.marketKey === family && item.selection === pick.selection);
    if (!pick || !row || !isBasis(row.basis)) continue;
    prices.push({ family, selection: pick.selection, price: formatOddsHundredths(Number(row.displayHundredths)), basis: row.basis,
      retrievedAt: historyTime(row.retrievedAt), providerUpdatedAt: row.providerUpdatedAt === null ? null : historyTime(row.providerUpdatedAt) });
  }
  return prices;
}

/** Complete market-implied groups for the detail page, outside the immutable revision cache. A group appears only
 * when every selection of its family is fresh and from one snapshot. */
export async function storedFixtureOddsGroups(tx: Tx, fixtureId: string,
  enabled: boolean = publicPolicy.features.providerOdds): Promise<DetailOddsGroup[]> {
  if (!enabled) return [];
  const rows = await freshRows(tx, fixtureId), groups: DetailOddsGroup[] = [];
  for (const family of publicPolicy.markets) {
    const selections = marketSelections[family] as readonly string[];
    const members = selections.map((selection) => rows.find((row) => row.marketKey === family && row.selection === selection));
    const first = members[0];
    if (!first || members.some((row) => !row || row.snapshotId !== first.snapshotId || row.overround !== first.overround ||
      row.basis !== first.basis || row.retrievedAt.getTime() !== first.retrievedAt.getTime()) || !isBasis(first.basis)) continue;
    groups.push({ label: "market-implied", family, basis: first.basis, method: first.method, overround: first.overround,
      retrievedAt: historyTime(first.retrievedAt), providerUpdatedAt: first.providerUpdatedAt === null ? null : historyTime(first.providerUpdatedAt),
      selections: members.map((row) => ({ selection: row!.selection, price: formatOddsHundredths(Number(row!.displayHundredths)),
        impliedProbability: row!.impliedProbability })) });
  }
  return groups;
}

export type QuoteSourceRow = Readonly<{ marketKey: string; selection: string; basis: string; displayHundredths: unknown; priceDecimal: string;
  line: string | null; method: string; mappingVersion: string; snapshotId: string | null; retrievedAt: Date; providerUpdatedAt: Date | null }>;
export type StoredQuoteSource = Readonly<{ state: Readonly<{ lastRetrievedAt: Date; withdrawnAt: Date | null }> | null; rows: readonly QuoteSourceRow[] }>;
/** The fixture's odds state and fresh public prices for a publication-time quote, in ONE non-locking statement so the
 * publication transaction (READ COMMITTED) sees a single consistent commit. No FOR SHARE (no new lock order against
 * odds apply) and no private snapshot read: FixtureOddsPrice is the authoritative public projection. */
export async function storedQuoteSource(tx: Tx, fixtureId: string): Promise<StoredQuoteSource> {
  const rows = await tx.$queryRaw<(Omit<QuoteSourceRow, "marketKey"> & { marketKey: string | null; lastRetrievedAt: Date; withdrawnAt: Date | null })[]>`
    SELECT s.lastRetrievedAt, s.withdrawnAt, p.marketKey, p.selection, p.basis, p.displayHundredths, CAST(p.priceDecimal AS CHAR) AS priceDecimal,
      CAST(p.line AS CHAR) AS line, p.method, p.mappingVersion, p.snapshotId, p.retrievedAt, p.providerUpdatedAt
    FROM FixtureOddsState s LEFT JOIN FixtureOddsPrice p ON p.fixtureId=s.fixtureId AND p.stale=FALSE WHERE s.fixtureId=${fixtureId}`;
  const first = rows[0];
  if (!first) return { state: null, rows: [] };
  return { state: { lastRetrievedAt: first.lastRetrievedAt, withdrawnAt: first.withdrawnAt },
    rows: rows.flatMap((row) => row.marketKey === null ? [] : [{ marketKey: row.marketKey, selection: row.selection, basis: row.basis,
      displayHundredths: row.displayHundredths, priceDecimal: row.priceDecimal, line: row.line, method: row.method, mappingVersion: row.mappingVersion,
      snapshotId: row.snapshotId, retrievedAt: row.retrievedAt, providerUpdatedAt: row.providerUpdatedAt }]) };
}
