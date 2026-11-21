import { z } from "zod";
import { fixturePriceSchema } from "./fixture-snapshot.ts";
import { storedMatchFeedResponseSchema, type StoredMatchFeedRecord, type StoredMatchFeedResponse } from "./match-feed.ts";
import { marketSelections } from "./markets.ts";
import type { SlipSelectionPrice } from "./slip-builder.ts";
import { parseDecimalOdds } from "./odds.ts";
import { slipBookmakerSchema, slipQuoteOddsSchema } from "./slip-quote.ts";
import { additionalSlipGoalSelection, isSlipMarketSelection, isTotal15SlipSelection, slipMarketFamilySchema,
  slipMarketSelections, type SlipAdditionalGoalForecast, type SlipMarketFamily, type SlipTotal15Forecast } from "./slip-markets.ts";

export const slipPricePageRules = Object.freeze({
  maximumPricesPerFixture: Object.values(marketSelections).reduce((total, selections) => total + selections.length, 0),
  maximumBookmakersPerFixture: 200,
});

/** Supplemental prices for published alternatives. The ordinary feed's selected-pick prices remain unchanged.
 * Freshness and public display permission come from the stored projection, not a browser age heuristic. */
const slipSelectionPriceSchema = z.strictObject({
  ...fixturePriceSchema.shape, family: slipMarketFamilySchema, price: slipQuoteOddsSchema, bookmaker: slipBookmakerSchema.optional(),
}).refine(({ basis, bookmaker, price, recovery, providerUpdatedAt, retrievedAt }) =>
  (!bookmaker || basis === "bookmaker") && (bookmaker ? parseDecimalOdds(price) !== null : recovery || /^\d+\.\d{2}$/u.test(price)) &&
  (recovery === undefined || basis === "bookmaker" && parseDecimalOdds(price) !== null &&
    (providerUpdatedAt === null || providerUpdatedAt <= retrievedAt)));
function pricePoolsSchema(maximumOutcomes: number) {
  return z.record(z.string(), z.array(slipSelectionPriceSchema).max(maximumOutcomes * slipPricePageRules.maximumBookmakersPerFixture));
}
export const slipSelectionPricesSchema = pricePoolsSchema(
  Object.values(slipMarketSelections).reduce((total, selections) => total + selections.length, 0));

/** Identical outcome ownership, uniqueness and observation-cutoff checks for pages and atomic cohorts. */
export function refineSlipPricePools(records: readonly StoredMatchFeedRecord[], selectionPrices: Readonly<Record<string, readonly SlipSelectionPrice[]>>,
  asOf: number, context: z.RefinementCtx, total15Forecasts?: Readonly<Record<string, SlipTotal15Forecast>>,
  additionalGoalForecasts?: Readonly<Record<string, SlipAdditionalGoalForecast>>) {
  const fixtures = new Map(records.map((record) => [record.fixtureId, record]));
  for (const record of records) {
    if (!Object.hasOwn(selectionPrices, record.fixtureId)) {
      context.addIssue({ code: "custom", path: ["selectionPrices", record.fixtureId], message: "Every feed fixture requires a price pool." });
    }
  }
  for (const [fixtureId, prices] of Object.entries(selectionPrices)) {
    const record = fixtures.get(fixtureId);
    if (!record) {
      context.addIssue({ code: "custom", path: ["selectionPrices", fixtureId], message: "A price pool must belong to this feed page." });
      continue;
    }
    const markets = new Map<SlipMarketFamily, NonNullable<StoredMatchFeedRecord["forecast"]>["markets"][number]["market"]>(
      record.forecast?.markets.map(({ market }) => [market.family, market]) ?? []);
    const seen = new Set<string>();
    prices.forEach((price, index) => {
      const path = ["selectionPrices", fixtureId, index], key = `${price.family}\u0000${price.selection}\u0000${price.bookmaker?.id ?? ""}`;
      const market = markets.get(price.family);
      if (seen.has(key)) {
        context.addIssue({ code: "custom", path, message: "Each bookmaker may offer one price for a family and selection." });
      }
      seen.add(key);
      const goal = additionalSlipGoalSelection(price.selection);
      const hasForecast = isTotal15SlipSelection(price.selection)
        ? !!total15Forecasts?.[fixtureId] && !!price.bookmaker && !price.recovery
        : goal ? !!price.bookmaker && !price.recovery && additionalGoalForecasts?.[fixtureId]?.markets.some(({ key }) => key === goal.key)
          : !!market && Object.hasOwn(market.probabilities, price.selection);
      if (!isSlipMarketSelection(price.family, price.selection) || !hasForecast) {
        context.addIssue({ code: "custom", path, message: "A price must belong to a published market outcome." });
      }
      if (price.retrievedAt > asOf || price.providerUpdatedAt !== null && price.providerUpdatedAt > asOf) {
        context.addIssue({ code: "custom", path, message: "A price observation cannot be later than the feed observation." });
      }
    });
  }
}

export const slipPricePageSchema = z.strictObject({
  feed: storedMatchFeedResponseSchema, selectionPrices: pricePoolsSchema(slipPricePageRules.maximumPricesPerFixture),
}).superRefine(({ feed, selectionPrices }, context) => refineSlipPricePools(feed.records, selectionPrices, feed.asOf, context));

export type SlipPricePage = Readonly<{
  feed: StoredMatchFeedResponse;
  selectionPrices: Readonly<Record<string, readonly SlipSelectionPrice[]>>;
}>;
