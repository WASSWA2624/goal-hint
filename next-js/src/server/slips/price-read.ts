import "server-only";

import type { FixturePrice } from "../../domain/fixture-snapshot.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import type { MarketFamily } from "../../domain/markets.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { launchOddsMapping, launchOddsQuotes } from "../../domain/odds-markets.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { SlipSelectionPrice } from "../../domain/slip-builder.ts";
import { slipBookmakerSchema, slipQuoteOddsSchema } from "../../domain/slip-quote.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { storedFixtureOddsGroups } from "../odds/odds-read.ts";

/** The reviewed joint and automated pipelines retain their existing primary-bookmaker pricing inputs. */
async function storedPrimarySlipPrices(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[]):
Promise<Readonly<Record<string, readonly FixturePrice[]>>> {
  return Object.fromEntries(await Promise.all(records.map(async (record) => {
    const markets = record.forecast?.markets.map((item) => item.market) ?? [];
    const groups = markets.length ? await storedFixtureOddsGroups(tx, record.fixtureId, true) : [];
    // The selected-price projection can legitimately publish one fresh quote while its other outcomes
    // are unavailable. Keep that approved quote; a complete supplementary group takes priority.
    const pool = new Map(record.prices.filter((price) => markets.some((market) => market.family === price.family))
      .map((price) => [`${price.family}\u0000${price.selection}`, price]));
    const prices = groups.filter((group) => markets.some((market) => market.family === group.family))
      .flatMap((group) => group.selections.map((selection) => ({ family: group.family, selection: selection.selection,
        price: selection.price, basis: group.basis, retrievedAt: group.retrievedAt, providerUpdatedAt: group.providerUpdatedAt })));
    for (const price of prices) pool.set(`${price.family}\u0000${price.selection}`, price);
    const recommendation = record.forecast?.recommendation?.selected;
    const original = recommendation && record.prices.find((price) => price.family === recommendation.family && price.selection === recommendation.selection);
    if (original) pool.set(`${original.family}\u0000${original.selection}`, original);
    return [record.fixtureId, [...pool.values()]] as const;
  })));
}

/** Read exact prices for individual published outcomes, including incomplete bookmaker groups. */
export function slipPricesFromBookmakers(record: StoredMatchFeedRecord, current: StoredCurrentBookmakerQuotes,
  families: readonly MarketFamily[] = publicPolicy.markets): SlipSelectionPrice[] {
  if (current.fixtureId !== record.fixtureId || current.kickoffAt !== record.kickoffAt || record.status !== "scheduled" || !record.forecast) return [];
  const forecastMarkets = new Set(record.forecast.markets.map(({ market }) => market.family));
  const mappings = launchOddsMapping.filter(({ family }) => forecastMarkets.has(family) && families.includes(family));
  return current.bookmakers.flatMap((book) => {
    const bookmaker = slipBookmakerSchema.safeParse({ id: book.bookmakerId, name: book.bookmakerName });
    if (!bookmaker.success) return [];
    return mappings.flatMap((mapping) => {
      const bet = book.offers.find(({ betId }) => betId === mapping.betId);
      return launchOddsQuotes(mapping, bet, bet?.betName).flatMap(({ selection, price }) => {
        const decimal = slipQuoteOddsSchema.safeParse(displayMarketOddsPrice(price.text));
        return decimal.success && bet ? [{ family: mapping.family, selection, price: decimal.data, basis: "bookmaker" as const,
          retrievedAt: current.checkedAt, providerUpdatedAt: bet.providerUpdatedAt, bookmaker: bookmaker.data }] : [];
      });
    });
  });
}

/** A bounded, current stored cohort. Neither custom nor automated generation requests bookmaker data. */
export async function storedSlipPricePools(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number,
  options: Readonly<{ enabled?: boolean; primaryBookmakerOnly?: boolean; families?: readonly MarketFamily[] }> = {}):
Promise<Readonly<Record<string, readonly SlipSelectionPrice[]>>> {
  if (!(options.enabled ?? publicPolicy.features.providerOdds)) return Object.fromEntries(records.map(({ fixtureId }) => [fixtureId, []]));
  if (options.primaryBookmakerOnly) return storedPrimarySlipPrices(tx, records);
  const families = options.families ?? publicPolicy.markets;
  const scheduled = records.filter(({ forecast, status }) => status === "scheduled" && forecast?.markets.some(({ market }) => families.includes(market.family)));
  const betIds = launchOddsMapping.filter(({ family }) => families.includes(family)).map(({ betId }) => betId);
  const quotes = await storedCurrentBookmakerQuotes(tx, scheduled, asOf, betIds);
  return Object.fromEntries(records.map((record) => {
    const current = quotes.get(record.fixtureId);
    return [record.fixtureId, current ? slipPricesFromBookmakers(record, current, families) : []];
  }));
}
