import assert from "node:assert/strict";
import test from "node:test";
import { registeredForecastGoalMarkets } from "../src/domain/goal-market-definitions.ts";
import { localFeaturedDecisionVersion as version } from "../src/domain/local-featured-decision.ts";
import {
  featuredEvaluationOccurrence, summarizeFeaturedHistoryComparison,
} from "../src/server/intelligence/local-featured-history-evaluation.ts";

const definitions = registeredForecastGoalMarkets(true).map(({ definition }) => definition);
const market = (line, terms = "asian") => `goal:full-time:totals:total:${line}:${terms}`;
const quote = { decimal: "1.5001" };
const priced = (marketKey, selection) => ({ version, status: "priced", tier: "standard", marketKey, selection,
  probability: 0.73, expectedNetReturn: "0.095073", threshold: 0.7, quote });
const unpriced = (marketKey, selection) => ({ version, status: "forecast-only", marketKey, selection,
  probability: 0.73, reason: "no-comparable-quote" });
const originalTruth = (home, away) => ({ status: "finished-penalties", cycleEligibility: { eligible: true },
  regulationScore: { verified: true, period: "regulation-including-stoppage-time", home, away },
  halfTimeScore: { verified: true, period: "first-half-including-stoppage-time", home: 0, away: 0 } });
const sample = (fixtureId, baseline, informed, cohort = "sealed-audit", supported = 0) => ({
  fixtureId, cohort, kickoffAt: 300_000, decisionAt: 299_999, definitions, baseline, informed,
  history: { assessed: 2, supported, scopes: { [supported ? "global:supported" : "none:sparse"]: 2 } },
});

test("the history report grades exact selections with half payouts and pushes, separates unpriced coverage, and pairs the same fixtures", () => {
  const changed = sample("changed", priced("total-goals", "over-2.5"), priced(market(1.25), "under"), undefined, 2);
  const pushed = sample("push", priced(market(2), "under"), priced(market(2), "under"));
  const partiallyLost = sample("half-loss", priced(market(1.25), "over"), priced(market(1.25), "over"));
  const forecastOnly = sample("unpriced", unpriced(market(1.5, "binary"), "under"), unpriced(market(1.5, "binary"), "under"), "newer");
  const unsettled = sample("pending", priced(market(1.5, "binary"), "under"), priced(market(1.5, "binary"), "under"), "newer");
  const rows = [changed, pushed, partiallyLost, forecastOnly, unsettled];
  const labels = new Map([[changed, originalTruth(1, 0)], [pushed, originalTruth(1, 1)],
    [partiallyLost, originalTruth(1, 0)], [forecastOnly, originalTruth(0, 0)]].map(([row, result]) => [featuredEvaluationOccurrence(row), result]));
  const { total, byCohort } = summarizeFeaturedHistoryComparison(rows, labels);

  assert.equal(total.changedOutcomes, 1);
  assert.deepEqual(total.baseline.grades, { incorrect: 1, push: 1, "half-loss": 1, correct: 1, "unverified-result": 1 });
  assert.deepEqual(total.informed.grades, { "half-win": 1, push: 1, "half-loss": 1, correct: 1, "unverified-result": 1 });
  assert.equal(total.paired.bothSettled, 4);
  assert.equal(total.paired.bothPricedSettled, 3);
  assert.equal(total.paired.realizedProfitDeltaUnits, 1.25005);
  assert.equal(total.changed.realizedReturnDeltaPerUnit, 1.25005);
  assert.equal(total.informed.profitUnits, -0.24995);
  assert.equal(total.history.fixturesWithSparseFallback, 4);
  assert.equal(total.history.fixturesWithSupport, 1);
  assert.equal(byCohort.newer.informed.outrightWins, 1);
  assert.equal(byCohort.newer.informed.realizedReturnPerUnit, null);
});

test("a duplicate occurrence or non-pre-match clock cannot contribute to the comparison", () => {
  const row = sample("row", unpriced(market(1.5, "binary"), "under"), unpriced(market(1.5, "binary"), "under"));
  assert.throws(() => summarizeFeaturedHistoryComparison([row, row], new Map()), /duplicate decision clocks/u);
  assert.throws(() => summarizeFeaturedHistoryComparison([{ ...row, kickoffAt: row.decisionAt }], new Map()), /invalid or duplicate/u);
});
