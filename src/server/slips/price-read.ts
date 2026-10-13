import "server-only";

import type { FixturePrice } from "../../domain/fixture-snapshot.ts";
import type { MatchFeedRecord } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedFixtureOddsGroups } from "../odds/odds-read.ts";

/** Only the existing public complete-group projection can supply alternative quotes. Source probabilities
 * stay in the published forecast; market-implied probabilities and private bookmaker identifiers never escape. */
export async function storedSlipPricePools(tx: Prisma.TransactionClient, records: readonly MatchFeedRecord[],
  enabled: boolean = publicPolicy.features.providerOdds): Promise<Readonly<Record<string, readonly FixturePrice[]>>> {
  return Object.fromEntries(await Promise.all(records.map(async (record) => {
    const markets = record.forecast?.markets.map((item) => item.market) ?? [];
    const groups = enabled && markets.length ? await storedFixtureOddsGroups(tx, record.fixtureId, enabled) : [];
    // The selected-price projection can legitimately publish one fresh quote while its other outcomes
    // are unavailable. Keep that approved quote; a complete supplementary group takes priority.
    const pool = new Map((enabled ? record.prices.filter((price) => markets.some((market) => market.family === price.family)) : [])
      .map((price) => [`${price.family}\u0000${price.selection}`, price]));
    const prices = groups.filter((group) => markets.some((market) => market.family === group.family))
      .flatMap((group) => group.selections.map((selection) => ({ family: group.family, selection: selection.selection,
        price: selection.price, basis: group.basis, retrievedAt: group.retrievedAt, providerUpdatedAt: group.providerUpdatedAt })));
    for (const price of prices) pool.set(`${price.family}\u0000${price.selection}`, price);
    return [record.fixtureId, [...pool.values()]] as const;
  })));
}
