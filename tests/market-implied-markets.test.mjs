import assert from "node:assert/strict";
import test from "node:test";
import { asianPayoutGrade } from "../src/domain/market-payout.ts";
import { impliedBetMappingSchema, deriveMappedImpliedMarket, impliedCatalogCoverage } from "../src/domain/market-implied-markets.ts";
import { nonGoalResultMarket, nonGoalTotalsMarket, nonGoalParityMarket, nonGoalExactCountMarket, nonGoalDoubleChanceMarket,
  nonGoalAsianHandicapMarket, nonGoalHandicapMarket, nonGoalEventMarket, nonGoalEventTeamMarket, nonGoalMarketDefinitionSchema } from "../src/domain/non-goal-market-definitions.ts";
import { marketImpliedPerformance, settleNonGoalSelection } from "../src/domain/non-goal-market-settlement.ts";

const mapping = (definition, labels = Object.fromEntries(definition.selections.map(({ key, label }) => [key, label]))) =>
  ({ betId: 9001, betName: "Synthetic corners book", definition, providerLabels: labels });
const catalog = new Map([[9001, "Synthetic corners book"]]);
const quote = (value, prices) => ({ betId: value.betId, betName: value.betName,
  values: value.definition.selections.map(({ key }, index) => ({ label: value.providerLabels[key], odd: prices[index] })) });
const context = (definition, home, away, overrides = {}) => ({ status: "finished-regulation", cycleEligibility: { eligible: true }, resultUsable: true,
  evidence: { counts: [{ metric: definition.metric, period: definition.period, scope: "regulation-including-stoppage-time",
    countingRule: definition.countingRule, verified: true, home, away }], events: [] }, ...overrides });

test("two-way and multi-way books de-margin complete exact groups with explicit market-implied provenance", () => {
  for (const [definition, prices, expected] of [[nonGoalTotalsMarket("corners", 10.5), ["2.00", "2.00"], ["0.500000000000", "0.500000000000"]],
    [nonGoalResultMarket("corners"), ["2.00", "4.00", "4.00"], ["0.500000000000", "0.250000000000", "0.250000000000"]]]) {
    const value = mapping(definition), result = deriveMappedImpliedMarket(value, catalog, quote(value, prices));
    assert.equal(result.available, true);
    assert.equal(result.market.source, "market-implied");
    assert.equal(result.market.method, "proportional-v1");
    assert.deepEqual(result.market.selections.map(({ normalizedProbability }) => normalizedProbability), expected);
    assert.equal(result.market.selection, definition.selections[0].key);
    assert.equal(result.market.probabilityBasis, "normalized-bookmaker-price");
  }
  const value = mapping(nonGoalDoubleChanceMarket("corners"));
  const result = deriveMappedImpliedMarket(value, catalog, quote(value, ["1.50", "1.50", "1.50"]));
  assert.equal(result.market.coverage, 2);
  assert.deepEqual(result.market.selections.map(({ normalizedProbability }) => normalizedProbability), Array(3).fill("0.666666666667"));
});

test("missing, duplicate, mismatched, wrong-line or invalid-price selections never manufacture probabilities", () => {
  const value = mapping(nonGoalTotalsMarket("corners", 10.5)), observation = quote(value, ["1.90", "1.90"]);
  assert.equal(deriveMappedImpliedMarket(value, null, observation).reason, "unverified-provider-bet");
  assert.equal(deriveMappedImpliedMarket(value, new Map([[9001, "Renamed"]]), observation).available, false);
  assert.equal(deriveMappedImpliedMarket(value, catalog, { ...observation, betId: 9002 }).available, false);
  assert.equal(deriveMappedImpliedMarket(value, catalog, { ...observation, values: observation.values.slice(0, 1) }).reason, "incomplete-provider-group");
  assert.equal(deriveMappedImpliedMarket(value, catalog, { ...observation, values: [...observation.values, observation.values[0]] }).available, false);
  assert.equal(deriveMappedImpliedMarket(value, catalog, { ...observation, values: observation.values.map((row) => ({ ...row, label: row.label.replace("10.5", "9.5") })) }).available, false);
  assert.equal(deriveMappedImpliedMarket(value, catalog, quote(value, ["1.00", "2.00"])).reason, "invalid-price-group");
  assert.equal(impliedBetMappingSchema.safeParse({ ...value, providerLabels: { over: "Over 10.5" } }).success, false);
});

test("canonical identities distinguish period, line, team, player and counting rule; unsupported catalog bets remain inventoried", () => {
  const definitions = [nonGoalTotalsMarket("corners", 9.5), nonGoalTotalsMarket("corners", 10.5),
    nonGoalTotalsMarket("corners", 9.5, { scope: "home" }), nonGoalTotalsMarket("corners", 9.5, { period: "half-time" }),
    nonGoalTotalsMarket("corners", 9.5, { countingRule: "another-count-v1" }), nonGoalEventMarket("goals", "any", {}, 101), nonGoalEventMarket("goals", "any", {}, 102)];
  assert.equal(new Set(definitions.map(({ key }) => key)).size, definitions.length);
  const known = mapping(definitions[0]), coverage = impliedCatalogCoverage([{ id: 9001, name: known.betName }, { id: 9002, name: "Unreviewed synthetic bet" }], [known]);
  assert.deepEqual(coverage[0].marketKeys, [definitions[0].key]);
  assert.equal(coverage[1].reason, "unreviewed-settlement-rule");
  assert.throws(() => nonGoalTotalsMarket("goals", 2.5));
  assert.equal(nonGoalMarketDefinitionSchema.safeParse({ ...definitions[0], key: "implied:wrong-period" }).success, false);
});

test("count settlement needs the exact verified period and metric; missing counts never become zero", () => {
  const definition = nonGoalTotalsMarket("corners", 9.5);
  assert.equal(settleNonGoalSelection(definition, "over", context(definition, 6, 4)).status, "correct");
  assert.equal(settleNonGoalSelection(definition, "under", context(definition, 6, 4)).status, "incorrect");
  assert.equal(settleNonGoalSelection(definition, "under", context(definition, 0, 0)).status, "correct");
  assert.equal(settleNonGoalSelection(definition, "under", context(definition, null, null)).status, "pending");
  assert.equal(settleNonGoalSelection(definition, "over", context(definition, 6, 4, { evidence: null })).status, "pending");
  const extra = context(definition, 6, 4); extra.evidence.counts[0].scope = "including-extra-time";
  assert.equal(settleNonGoalSelection(definition, "over", extra).status, "pending");
  const half = nonGoalTotalsMarket("corners", 4.5, { period: "half-time" });
  assert.equal(settleNonGoalSelection(half, "over", context(definition, 6, 4)).status, "pending");
  assert.equal(settleNonGoalSelection(definition, "over", context(definition, 6, 4, { status: "live" })).status, "pending");
  assert.equal(settleNonGoalSelection(definition, "over", context(definition, 6, 4, { resultUsable: false })).status, "pending");
  for (const status of ["postponed", "canceled", "abandoned", "awarded"]) assert.equal(settleNonGoalSelection(definition, "over", context(definition, null, null, { status })).status, "void");
  assert.equal(settleNonGoalSelection(definition, "over", context(definition, 6, 4, { cycleEligibility: { eligible: false, reason: "cutoff-invalidated" } })).status, "void");
});

test("metric result, handicap, parity and exhaustive exact count rules settle independently of the football score", () => {
  for (const [definition, key] of [[nonGoalResultMarket("corners"), "home"], [nonGoalDoubleChanceMarket("corners"), "home-draw"],
    [nonGoalHandicapMarket("corners", -2), "draw"], [nonGoalParityMarket("corners"), "even"], [nonGoalExactCountMarket("corners", [8, 9, 10]), "10"]]) {
    assert.equal(settleNonGoalSelection(definition, key, context(definition, 6, 4)).status, "correct");
  }
});

test("Asian payouts retain push and half grades, and normalized odds do not claim unconditional win probabilities", () => {
  const line = nonGoalTotalsMarket("corners", 10.25, {}, true), value = mapping(line);
  assert.equal(deriveMappedImpliedMarket(value, catalog, quote(value, ["1.90", "1.90"])).market.probabilityBasis, "conditional-payout-price");
  assert.equal(settleNonGoalSelection(line, "over", context(line, 6, 4)).status, "half-loss");
  assert.equal(settleNonGoalSelection(line, "under", context(line, 6, 4)).status, "half-win");
  const handicap = nonGoalAsianHandicapMarket("corners", -2);
  assert.equal(settleNonGoalSelection(handicap, "home", context(handicap, 6, 4)).status, "push");
  assert.throws(() => asianPayoutGrade(0.1, () => 1));
  assert.throws(() => asianPayoutGrade(0.25, () => NaN));
});

test("event ordering and scorer identity require a complete verified stored event list", () => {
  const definition = nonGoalEventTeamMarket("cards", "first"), facts = context(definition, 0, 0);
  facts.evidence.events = [{ metric: "cards", period: "full-time", scope: "regulation-including-stoppage-time", countingRule: definition.countingRule,
    verified: true, complete: true, entries: [{ sequence: 2, team: "home", playerId: 102, minute: 20, extra: null }, { sequence: 1, team: "away", playerId: 101, minute: 20, extra: null }] }];
  assert.equal(settleNonGoalSelection(definition, "away", facts).status, "correct");
  facts.evidence.events[0].complete = false;
  assert.equal(settleNonGoalSelection(definition, "away", facts).status, "pending");
  facts.evidence.events[0].complete = true; facts.evidence.events[0].entries = [];
  assert.equal(settleNonGoalSelection(definition, "none", facts).status, "correct");
  const scorer = nonGoalEventMarket("goals", "any", {}, 101), scored = context(scorer, 0, 0);
  scored.evidence.counts = []; scored.evidence.events = [{ ...facts.evidence.events[0], metric: "goals", countingRule: scorer.countingRule,
    entries: [{ sequence: 1, team: "home", playerId: null, minute: 50, extra: null }] }];
  assert.equal(settleNonGoalSelection(scorer, "no", scored).reason, "missing-player-identity");
  scored.evidence.events[0].entries[0].playerId = 101;
  assert.equal(settleNonGoalSelection(scorer, "yes", scored).status, "correct");
});

test("market-implied performance excludes AI, unavailable, pending and ineligible rows and keeps payouts separate", () => {
  const row = (status, source = "market-implied", eligibleForCounting = true) => ({ marketKey: "implied:test", status, source, eligibleForCounting });
  assert.deepEqual(marketImpliedPerformance([row("correct"), row("incorrect"), row("half-win"), row("push"), row("pending"), row("correct", "ai-score-distribution"), row("correct", "market-implied", false)]),
    [{ source: "market-implied", marketKey: "implied:test", correct: 1, incorrect: 1, halfWin: 1, halfLoss: 0, push: 1, denominator: 2, hitRate: 0.5 }]);
});
