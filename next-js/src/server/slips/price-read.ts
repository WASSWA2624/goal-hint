import "server-only";

import type { FixturePrice } from "../../domain/fixture-snapshot.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import type { MarketFamily } from "../../domain/markets.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { recommendationMarket } from "../../domain/recommendation-view.ts";
import { launchOddsMapping, launchOddsQuotes } from "../../domain/odds-markets.ts";
import { formatOddsHundredths, parseDecimalOdds } from "../../domain/odds.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { SlipSelectionPrice } from "../../domain/slip-builder.ts";
import { slipBookmakerSchema, slipQuoteOddsSchema } from "../../domain/slip-quote.ts";
import { total15Direction, total15SlipSelections, type SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { completePriceGroups, storedUpcomingOddsRows } from "../odds/odds-read.ts";
import { historyTime } from "../predictions/history-read.ts";

const totalsBet = launchOddsMapping.find(({ family }) => family === "total-goals")!;

/** The reviewed joint and automated pipelines retain their existing primary-bookmaker pricing inputs. */
async function storedPrimarySlipPrices(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number):
Promise<Readonly<Record<string, readonly FixturePrice[]>>> {
  const scheduled = records.filter(({ status, forecast }) => status === "scheduled" && forecast?.markets.length);
  const rows = await storedUpcomingOddsRows(tx, scheduled.map(({ fixtureId }) => fixtureId), asOf);
  return Object.fromEntries(records.map(({ fixtureId, forecast, kickoffAt }) => {
    const offers = rows.get(fixtureId);
    if (!forecast || !offers || offers[0]?.kickoff.getTime() !== kickoffAt) return [fixtureId, []];
    const picks = new Map(forecast.markets.map(({ market }) => [market.family, recommendationMarket(market, forecast.recommendation).selection]));
    const groups = new Set(completePriceGroups(offers).map(({ family }) => family));
    const prices = offers.flatMap<FixturePrice>(({ marketKey, selection, basis, displayHundredths, checkedAt, providerUpdatedAt }) => {
      const family = marketKey as MarketFamily;
      const pick = picks.get(family);
      return basis === "bookmaker" && pick && (selection === pick || groups.has(family))
        ? [{ family, selection, basis, price: formatOddsHundredths(Number(displayHundredths)), retrievedAt: historyTime(checkedAt),
          providerUpdatedAt: providerUpdatedAt === null ? null : historyTime(providerUpdatedAt) }] : [];
    });
    return [fixtureId, prices];
  }));
}

/** Read exact prices for individual published outcomes, including incomplete bookmaker groups. */
export function slipPricesFromBookmakers(record: StoredMatchFeedRecord, current: StoredCurrentBookmakerQuotes,
  families: readonly MarketFamily[] = publicPolicy.markets, total15?: SlipTotal15Forecast): SlipSelectionPrice[] {
  if (current.fixtureId !== record.fixtureId || current.kickoffAt !== record.kickoffAt || record.status !== "scheduled" || !record.forecast) return [];
  const forecastMarkets = new Set(record.forecast.markets.map(({ market }) => market.family));
  const mappings = launchOddsMapping.filter(({ family }) => forecastMarkets.has(family) && families.includes(family));
  return current.bookmakers.flatMap((book) => {
    const bookmaker = slipBookmakerSchema.safeParse({ id: book.bookmakerId, name: book.bookmakerName });
    if (!bookmaker.success) return [];
    const prices: SlipSelectionPrice[] = mappings.flatMap((mapping) => {
      const bet = book.offers.find(({ betId }) => betId === mapping.betId);
      return launchOddsQuotes(mapping, bet, bet?.betName).flatMap(({ selection, price }) => {
        const decimal = slipQuoteOddsSchema.safeParse(displayMarketOddsPrice(price.text));
        return decimal.success && bet ? [{ family: mapping.family, selection, price: decimal.data, basis: "bookmaker" as const,
          retrievedAt: current.checkedAt, providerUpdatedAt: bet.providerUpdatedAt, bookmaker: bookmaker.data }] : [];
      });
    });
    if (total15 && families.includes("total-goals")) {
      const bet = book.offers.find(({ betId, betName }) => betId === totalsBet.betId && betName === totalsBet.betName);
      for (const selection of total15SlipSelections) {
        const matches = bet?.values.filter(({ label }) => label === (total15Direction(selection) === "over" ? "Over 1.5" : "Under 1.5"));
        const odds = matches?.length === 1 ? parseDecimalOdds(matches[0]!.odd) : null;
        if (odds && bet) prices.push({ family: "total-goals", selection, price: displayMarketOddsPrice(odds.text), basis: "bookmaker",
          retrievedAt: current.checkedAt, providerUpdatedAt: bet.providerUpdatedAt, bookmaker: bookmaker.data });
      }
    }
    return prices;
  });
}

/** A bounded, current stored cohort. Neither custom nor automated generation requests bookmaker data. */
export async function storedSlipPricePools(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number,
  options: Readonly<{ enabled?: boolean; primaryBookmakerOnly?: boolean; families?: readonly MarketFamily[];
    total15Forecasts?: Readonly<Record<string, SlipTotal15Forecast>> }> = {}):
Promise<Readonly<Record<string, readonly SlipSelectionPrice[]>>> {
  if (!(options.enabled ?? publicPolicy.features.providerOdds)) return Object.fromEntries(records.map(({ fixtureId }) => [fixtureId, []]));
  if (options.primaryBookmakerOnly) return storedPrimarySlipPrices(tx, records, asOf);
  const families = options.families ?? publicPolicy.markets;
  const scheduled = records.filter(({ fixtureId, forecast, status }) => status === "scheduled"
    && (options.total15Forecasts?.[fixtureId] || forecast?.markets.some(({ market }) => families.includes(market.family))));
  const betIds = launchOddsMapping.filter(({ family }) => families.includes(family)).map(({ betId }) => betId);
  const quotes = await storedCurrentBookmakerQuotes(tx, scheduled, asOf, betIds);
  return Object.fromEntries(records.map((record) => {
    const current = quotes.get(record.fixtureId);
    return [record.fixtureId, current ? slipPricesFromBookmakers(record, current, families, options.total15Forecasts?.[record.fixtureId]) : []];
  }));
}
