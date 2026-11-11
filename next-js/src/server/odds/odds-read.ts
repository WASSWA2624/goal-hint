import "server-only";

import type { FixturePrice } from "../../domain/fixture-snapshot.ts";
import type { DetailOddsGroup } from "../../domain/match-detail.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { marketOddsObservationSchema } from "../../domain/in-play-odds.ts";
import { formatOddsHundredths, oddsRules, parseDecimalOdds } from "../../domain/odds.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyTime } from "../predictions/history-read.ts";
import { preMatchOddsFreshMs } from "./odds-contract.ts";

type Tx = Prisma.TransactionClient;
// Compare the stored decimal before rounding: an old 1.0099 quote displays as 1.01.
export const minimumFixturePrice = Prisma.sql`CAST(${formatOddsHundredths(oddsRules.minimumHundredths)} AS DECIMAL(10,4))`;
/** Feed join: 1:1 by the projection's primary key, on exactly the shown pick's family and selection, fresh rows only.
 * Aliases: f = FootballFixture, m = the shown MarketPrediction, op = its price. */
export const oddsPriceJoin = Prisma.sql`LEFT JOIN FixtureOddsPrice op ON op.fixtureId=f.id AND op.marketKey=m.family
      AND op.selection=m.selection AND op.stale=FALSE AND op.priceDecimal>=${minimumFixturePrice}`;

export type FixturePriceRow = { marketKey: string; selection: string; basis: string; displayHundredths: unknown; impliedProbability: string;
  overround: string; method: string; snapshotId: string | null; retrievedAt: Date; providerUpdatedAt: Date | null };
const priceFields = Prisma.sql`p.marketKey,p.selection,p.basis,p.displayHundredths,CAST(p.impliedProbability AS CHAR) AS impliedProbability,
  CAST(p.overround AS CHAR) AS overround,p.method,p.snapshotId,p.retrievedAt,p.providerUpdatedAt`;
async function freshRows(tx: Tx, fixtureId: string): Promise<FixturePriceRow[]> {
  return tx.$queryRaw<FixturePriceRow[]>`SELECT ${priceFields} FROM FixtureOddsPrice p
    WHERE p.fixtureId = ${fixtureId} AND p.stale = FALSE AND p.priceDecimal>=${minimumFixturePrice}
    ORDER BY p.marketKey,p.selection`;
}
const isBasis = (value: string): value is FixturePrice["basis"] => value === "bookmaker" || value === "median";

/** Prices for the given published picks, by the same rule as the feed SQL join: exact family and selection,
 * fresh rows only, no fallback. Empty while provider odds are not publicly enabled. */
export async function storedFixturePrices(tx: Tx, fixtureId: string, picks: readonly Readonly<{ family: MarketFamily; selection: string }>[],
  enabled: boolean = publicPolicy.features.providerOdds): Promise<FixturePrice[]> {
  if (!enabled || picks.length === 0) return [];
  return fixturePricesFromRows(await freshRows(tx, fixtureId), picks);
}

export function fixturePricesFromRows(rows: readonly FixturePriceRow[], picks: readonly Readonly<{ family: MarketFamily; selection: string }>[]): FixturePrice[] {
  const prices: FixturePrice[] = [];
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
function completePriceGroups<T extends FixturePriceRow>(rows: readonly T[]) {
  return publicPolicy.markets.flatMap((family) => {
    const selections = marketSelections[family] as readonly string[];
    const members = selections.map((selection) => rows.find((row) => row.marketKey === family && row.selection === selection));
    const first = members[0];
    if (!first || !isBasis(first.basis) || !members.every((row): row is T => row !== undefined && row.snapshotId === first.snapshotId
      && row.overround === first.overround && row.basis === first.basis && row.retrievedAt.getTime() === first.retrievedAt.getTime())) return [];
    return [{ family, first, basis: first.basis, members }];
  });
}

export async function storedFixtureOddsGroups(tx: Tx, fixtureId: string,
  enabled: boolean = publicPolicy.features.providerOdds): Promise<DetailOddsGroup[]> {
  if (!enabled) return [];
  return completePriceGroups(await freshRows(tx, fixtureId)).map(({ family, first, basis, members }) =>
    ({ label: "market-implied", family, basis, method: first.method, overround: first.overround,
      retrievedAt: historyTime(first.retrievedAt), providerUpdatedAt: first.providerUpdatedAt === null ? null : historyTime(first.providerUpdatedAt),
      selections: members.map((row) => ({ selection: row.selection, price: formatOddsHundredths(Number(row.displayHundredths)),
        impliedProbability: row.impliedProbability })) }));
}

type UpcomingPriceRow = FixturePriceRow & { fixtureId: string; kickoff: Date; checkedAt: Date; priceDecimal: string };
/** Read only scheduled, confirmed quotes for the current page. A closing price stays in history. */
export async function storedUpcomingOddsForFixtures(tx: Tx, ids: readonly string[], asOf: number) {
  if (!ids.length) return [];
  const at = new Date(asOf);
  const rows = await tx.$queryRaw<UpcomingPriceRow[]>(Prisma.sql`SELECT ${priceFields},p.fixtureId,f.kickoff,
    s.lastRetrievedAt AS checkedAt,CAST(p.priceDecimal AS CHAR) AS priceDecimal
    FROM FixtureOddsPrice p JOIN FixtureOddsState s ON s.fixtureId=p.fixtureId
    JOIN FootballFixture f ON f.id=p.fixtureId WHERE p.fixtureId IN (${Prisma.join(ids)})
      AND f.status='scheduled' AND f.kickoff>${at} AND p.stale=FALSE AND s.withdrawnAt IS NULL
      AND p.priceDecimal>=${minimumFixturePrice} AND p.retrievedAt<=s.lastRetrievedAt
      AND s.lastRetrievedAt BETWEEN ${new Date(asOf - preMatchOddsFreshMs)} AND ${at}`);
  const byFixture = new Map<string, UpcomingPriceRow[]>();
  for (const row of rows) {
    const group = byFixture.get(row.fixtureId);
    if (group) group.push(row);
    else byFixture.set(row.fixtureId, [row]);
  }
  return [...byFixture].flatMap(([fixtureId, group]) => {
    const markets = completePriceGroups(group).flatMap(({ family, members }) => {
      const selections = members.flatMap(({ selection, priceDecimal }) => {
        const price = parseDecimalOdds(priceDecimal);
        return price ? [{ selection, price: price.text }] : [];
      });
      return selections.length === members.length ? [{ family, selections }] : [];
    });
    const first = group[0]!;
    if (!markets.length) return [];
    const observation = marketOddsObservationSchema.safeParse({ kind: "pre-match", checkedAt: first.checkedAt.getTime(),
      prices: { state: "available", markets } });
    return observation.success ? [{ fixtureId, kickoffAt: first.kickoff.getTime(), observation: observation.data }] : [];
  });
}

export type QuoteSourceRow = Readonly<{ marketKey: string; selection: string; basis: string; bookmakerId: number | null; displayHundredths: unknown; priceDecimal: string;
  line: string | null; method: string; mappingVersion: string; snapshotId: string | null; retrievedAt: Date; providerUpdatedAt: Date | null }>;
export type StoredQuoteSource = Readonly<{ state: Readonly<{ lastRetrievedAt: Date; withdrawnAt: Date | null }> | null; rows: readonly QuoteSourceRow[] }>;
/** The fixture's odds state and fresh public prices for a publication-time quote, in ONE non-locking statement so the
 * publication transaction (READ COMMITTED) sees a single consistent commit. No FOR SHARE (no new lock order against
 * odds apply) and no private snapshot read: FixtureOddsPrice is the authoritative public projection. */
export async function storedQuoteSource(tx: Tx, fixtureId: string): Promise<StoredQuoteSource> {
  const rows = await tx.$queryRaw<(Omit<QuoteSourceRow, "marketKey"> & { marketKey: string | null; lastRetrievedAt: Date; withdrawnAt: Date | null })[]>`
    SELECT s.lastRetrievedAt, s.withdrawnAt, p.marketKey, p.selection, p.basis, p.bookmakerExternalId AS bookmakerId, p.displayHundredths, CAST(p.priceDecimal AS CHAR) AS priceDecimal,
      CAST(p.line AS CHAR) AS line, p.method, p.mappingVersion, p.snapshotId, p.retrievedAt, p.providerUpdatedAt
    FROM FixtureOddsState s LEFT JOIN FixtureOddsPrice p ON p.fixtureId=s.fixtureId AND p.stale=FALSE WHERE s.fixtureId=${fixtureId}`;
  const first = rows[0];
  if (!first) return { state: null, rows: [] };
  return { state: { lastRetrievedAt: first.lastRetrievedAt, withdrawnAt: first.withdrawnAt },
    rows: rows.flatMap((row) => row.marketKey === null ? [] : [{ marketKey: row.marketKey, selection: row.selection, basis: row.basis,
      bookmakerId: row.bookmakerId === null ? null : Number(row.bookmakerId),
      displayHundredths: row.displayHundredths, priceDecimal: row.priceDecimal, line: row.line, method: row.method, mappingVersion: row.mappingVersion,
      snapshotId: row.snapshotId, retrievedAt: row.retrievedAt, providerUpdatedAt: row.providerUpdatedAt }]) };
}
