import { z } from "zod";
import { fixturePriceSchema, type FixturePrice } from "./fixture-snapshot.ts";
import { matchFeedResponseSchema, type MatchFeedResponse } from "./match-feed.ts";
import { isMarketSelection, marketSelections } from "./markets.ts";

export const slipPricePageRules = Object.freeze({
  maximumPricesPerFixture: Object.values(marketSelections).reduce((total, selections) => total + selections.length, 0),
});

/** Supplemental prices for published alternatives. The ordinary feed's selected-pick prices remain unchanged.
 * Freshness and public display permission come from the stored projection, not a browser age heuristic. */
export const slipPricePageSchema = z.strictObject({
  feed: matchFeedResponseSchema,
  selectionPrices: z.record(z.string(), z.array(fixturePriceSchema).max(slipPricePageRules.maximumPricesPerFixture)),
}).superRefine(({ feed, selectionPrices }, context) => {
  const fixtures = new Map(feed.records.map((record) => [record.fixtureId, record]));
  for (const record of feed.records) {
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
    const markets = new Map(record.forecast?.markets.map(({ market }) => [market.family, market]) ?? []);
    const seen = new Set<string>();
    prices.forEach((price, index) => {
      const path = ["selectionPrices", fixtureId, index], key = `${price.family}\u0000${price.selection}`;
      const market = markets.get(price.family);
      if (seen.has(key)) {
        context.addIssue({ code: "custom", path, message: "A family and selection may have only one price." });
      }
      seen.add(key);
      if (!market || !isMarketSelection(price.family, price.selection) || !Object.hasOwn(market.probabilities, price.selection)) {
        context.addIssue({ code: "custom", path, message: "A price must belong to a published market outcome." });
      }
      if (price.retrievedAt > feed.asOf || price.providerUpdatedAt !== null && price.providerUpdatedAt > feed.asOf) {
        context.addIssue({ code: "custom", path, message: "A price observation cannot be later than the feed observation." });
      }
    });
  }
});

export type SlipPricePage = Readonly<{
  feed: MatchFeedResponse;
  selectionPrices: Readonly<Record<string, readonly FixturePrice[]>>;
}>;
