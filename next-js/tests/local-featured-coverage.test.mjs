import assert from "node:assert/strict";
import test from "node:test";
import { auditLocalFeaturedCoverage } from "../src/domain/local-featured-coverage.ts";
import { binaryFeaturedSettlement, decideLocalFeaturedPick } from "../src/domain/local-featured-decision.ts";
import { registeredForecastGoalMarkets } from "../src/domain/goal-market-definitions.ts";
import { preMatchReferenceOddsFreshMs } from "../src/domain/reference-odds.ts";

const decisionAt = Date.UTC(2026, 10, 21, 4, 54, 59, 999);
const kickoffAt = Date.UTC(2026, 10, 21, 5);
const fixtureId = "2c4afcaf-67e3-86f3-ac6b-58cea9290340";
const observedAt = decisionAt - 1000;
const fullTimeGoals = (side, line) => `goal:full-time:totals:${side}:${line}:binary`;
const prices = (betId, betName, values, observation = {}) => ({
  betId, betName, observedAt, checkedAt: observedAt, providerUpdatedAt: null,
  values: Object.entries(values).map(([label, odd]) => ({ label, odd })), ...observation,
});
const book = (bookmakerId, ...offers) => ({ bookmakerId, bookmakerName: `Book ${bookmakerId}`, offers });
const model = (marketKey, selection, probability = 0.83, settlementProbabilities = binaryFeaturedSettlement(probability)) =>
  ({ marketKey, selection, settlementProbabilities });
const input = (outcomes, bookmakers) => ({ fixtureId, kickoffAt, decisionAt, quotesPermitted: true, outcomes,
  quotes: { fixtureId, kickoffAt, checkedAt: observedAt, bookmakers, provenance: "historical-pre-match" } });

test("counts registered exact intersections independently from unmatched offers and known catalog groups", () => {
  const asian = registeredForecastGoalMarkets(true).find(({ family, definition }) => family === "total-goals" &&
    definition.period === "full-time" && definition.group === "payout");
  assert.ok(asian);
  const setup = input([
    model(fullTimeGoals("total", 1.5), "over"), model("total-goals", "over-2.5"), model(fullTimeGoals("total", 2.5), "over"),
    model(fullTimeGoals("home", 2.5), "under"), model(fullTimeGoals("away", 2.5), "under"),
    model(asian.definition.key, asian.definition.selections[0].key, 0.7, { win: 0.7, loss: 0.15, push: 0.05, "half-win": 0.06, "half-loss": 0.04 }),
    model(fullTimeGoals("total", 3.5), "over", 0.8, { ...binaryFeaturedSettlement(0.8), push: 0.1 }),
  ], [
    book(32, prices(5, "Goals Over/Under", { "Over 1.5": "1.28", "Over 2.25": "1.65" }),
      prices(16, "Total - Home", { "Under 2.5": "2.1" }, { observedAt: decisionAt - preMatchReferenceOddsFreshMs - 1 }),
      prices(17, "Total - Away", { "Over 2.5": "1.55" }),
      prices(6, "Goals Over/Under", { "Under 2.5": "9" }), prices(77, "Synthetic unreviewed bet", { Home: "2" })),
    book(3, prices(5, "Goals Over/Under", { "Over 1.5": "1.25" })),
  ]);
  const audit = auditLocalFeaturedCoverage(setup);
  assert.deepEqual([
    audit.counts.modeledMarketGroups, audit.counts.validModeledOutcomes, audit.counts.invalidModeledOutcomes,
    audit.counts.modeledWithEligibleExactQuote, audit.counts.modeledWithNoExactQuote,
    audit.counts.modeledWithIneligibleExactQuote, audit.counts.modeledWithoutVerifiedBinding,
  ], [6, 5, 1, 1, 2, 1, 1]);
  assert.deepEqual([
    audit.counts.bookmakerBooks, audit.counts.bookmakerMarketGroups, audit.counts.distinctOfferedGroups,
    audit.counts.distinctOfferedGroupsWithReviewedMapping, audit.counts.distinctOfferedGroupsWithoutReviewedMapping,
    audit.counts.bookmakerPriceRows, audit.counts.boundEligiblePriceRowsWithModel, audit.counts.boundEligiblePriceRowsWithoutModel,
    audit.counts.boundIneligiblePriceRows, audit.counts.unboundPriceRows,
  ], [2, 6, 5, 3, 2, 7, 2, 1, 1, 3]);
  assert.equal(audit.counts["priceReason:stale-quote"], 1);
  assert.equal(audit.counts["priceReason:provider-name-mismatch"], 1);
  assert.equal(audit.counts["priceReason:no-reviewed-provider-mapping"], 1);
  assert.equal(audit.counts["priceReason:provider-selection-without-verified-binding"], 1);
  assert.equal(audit.counts["modelReason:incomplete-settlement-probabilities"], 1);
  assert.equal(audit.modeled.find(({ marketKey }) => marketKey === asian.definition.key).terms, "asian");
  assert.equal(audit.modeled.find(({ marketKey }) => marketKey === fullTimeGoals("away", 2.5)).status, "no-exact-quote");
  assert.deepEqual(audit.quoted.filter(({ status }) => status === "eligible-with-model")
    .map(({ quote, modeledWinProbability, expectedNetReturn }) => [quote.decimal, modeledWinProbability, expectedNetReturn]),
  [["1.28", 0.83, "0.0624"], ["1.25", 0.83, "0.0375"]]);
  const selected = decideLocalFeaturedPick(setup);
  assert.deepEqual([selected.marketKey, selected.selection, selected.quote.decimal], [fullTimeGoals("total", 1.5), "over", "1.28"]);
});

test("reports stale, post-decision, suspended and ambiguous odds without promoting them into the intersection", () => {
  const goalOver = { "Over 1.5": "2" };
  const multi = prices(5, "Goals Over/Under", goalOver);
  const setup = input([model(fullTimeGoals("total", 1.5), "over")], [
    book(1, { ...multi, values: [{ ...multi.values[0], suspended: true }] }),
    book(2, { ...multi, checkedAt: decisionAt + 1 }),
    book(3, { ...multi, values: [...multi.values, ...multi.values] }),
    book(4, multi, multi),
  ]);
  const audit = auditLocalFeaturedCoverage(setup);
  assert.equal(audit.counts.modeledWithEligibleExactQuote, 0);
  assert.equal(audit.counts.modeledWithIneligibleExactQuote, 1);
  assert.equal(audit.counts.boundIneligiblePriceRows, 6);
  assert.equal(audit.counts["priceReason:suspended-quote"], 1);
  assert.equal(audit.counts["priceReason:post-decision-quote"], 1);
  assert.equal(audit.counts["priceReason:duplicate-provider-selection"], 2);
  assert.equal(audit.counts["priceReason:duplicate-bookmaker-market"], 2);
  assert.equal(decideLocalFeaturedPick(setup).status, "abstained");
  const changed = auditLocalFeaturedCoverage({ ...setup, quotes: { ...setup.quotes, kickoffAt: kickoffAt + 60_000 } });
  assert.equal(changed.counts["quoteScope:different-fixture-occurrence"], 1);
  assert.equal(changed.counts["priceReason:different-fixture-occurrence"], 6);
  const withheld = auditLocalFeaturedCoverage({ ...setup, quotesPermitted: false });
  assert.equal(withheld.counts["quoteScope:odds-not-permitted"], 1);
  assert.deepEqual(withheld.quoted, []);
});
