import assert from "node:assert/strict";
import test from "node:test";
import { goalAsianHandicapMarket, goalDoubleChanceMarket, goalHalfFullMarket, liveGoalMarketDefinitions } from "../src/domain/goal-market-definitions.ts";
import { MARKET_REGISTRY_VERSION, marketProviderMappings, marketRegistry } from "../src/domain/market-registry.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { launchOddsMapping } from "../src/domain/odds-markets.ts";

test("market family metadata binds existing identity, temporal evidence and grading", () => {
  assert.equal(MARKET_REGISTRY_VERSION, "football-market-registry-v1");
  assert.deepEqual(marketRegistry["double-chance"].selections.keys, goalDoubleChanceMarket().selections.map(({ key }) => key));
  assert.equal(marketRegistry["double-chance"].grading, "overlapping");
  assert.deepEqual(marketRegistry["draw-no-bet"].selections.keys, goalAsianHandicapMarket(0).selections.map(({ key }) => key));
  assert.equal(marketRegistry["draw-no-bet"].parameters.line, "zero");
  assert.equal(marketRegistry["asian-handicap"].grading, "separate-push-and-partial-grades");
  assert.deepEqual(marketRegistry["half-time-full-time"].selections.keys, goalHalfFullMarket().selections.map(({ key }) => key));
  assert.deepEqual(marketRegistry["half-time-full-time"].periods, ["full-time"]);
  assert.equal(marketRegistry["half-time-full-time"].settlement.evidence, "verified-regulation-score-and-required-half-time-score");
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    assert.ok(liveGoalMarketDefinitions.some(({ key }) => key === `goal:full-time:totals:total:${line}:binary`));
  }
  assert.ok(Object.isFrozen(marketRegistry["draw-no-bet"].settlement.rules));
});

test("provider forecasts, pre-match odds and live odds have distinct mappings", () => {
  assert.strictEqual(marketProviderMappings.legacySelections, marketSelections);
  assert.strictEqual(marketProviderMappings["pre-match"].launch, launchOddsMapping);
  assert.equal(marketProviderMappings.forecast.group, "predictions.percent");
  assert.equal(marketProviderMappings["pre-match"].endpoint, "/odds/bets");
  assert.equal(marketProviderMappings.live.endpoint, "/odds/live/bets");
  for (const mapping of launchOddsMapping) {
    assert.equal(marketRegistry[mapping.family].legacyFamily, mapping.family);
    assert.notEqual(marketProviderMappings.live.launch[mapping.family].id, mapping.betId);
    assert.equal(marketProviderMappings.live.launch[mapping.family].labels.length, marketSelections[mapping.family].length);
  }
  assert.equal(marketRegistry["total-goals"].providerForecast, "unsupported");
});

test("reviewed settlement rules and missing models remain separately visible", () => {
  assert.equal(marketRegistry["highest-scoring-half"].settlement.basis, "unsupported");
  assert.equal(marketRegistry["scoring-in-both-halves"].models.reason, "no-cross-period-combination-rule");
  assert.deepEqual(marketRegistry["player-scorer"].parameters.eventOrder, ["any", "first", "last"]);
  assert.equal(marketRegistry["player-scorer"].parameters.player, "required");
  assert.equal(marketRegistry["player-scorer"].settlement.evidence, "complete-verified-period-events");
  assert.equal(marketRegistry["player-scorer"].models.basis, "unsupported");
  assert.equal(marketRegistry["player-totals"].bookmakerEvidence, "unmapped");
  assert.equal(marketRegistry["statistic-totals"].settlement.evidence, "verified-period-counts");
  assert.ok(marketRegistry["statistic-asian-handicap"].parameters.metric.includes("corners"));
});
