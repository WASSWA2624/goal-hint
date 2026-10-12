import assert from "node:assert/strict";
import test from "node:test";
import { parseScoreDistribution, SCORE_DISTRIBUTION_VERSION } from "../src/domain/score-distribution.ts";
import { deriveGoalMarket, settleGoalSelection } from "../src/domain/score-distribution-markets.ts";
import { goalAsianHandicapMarket, goalBothTeamsScoreMarket, goalCleanSheetMarket, goalCombinationMarket,
  goalDoubleChanceMarket, goalEuropeanHandicapMarket, goalExactScoreMarket, goalHalfFullMarket,
  goalParityMarket, goalResultMarket, goalTotalsMarket, goalWinToNilMarket } from "../src/domain/goal-market-definitions.ts";
import { deriveMappedGoalMarket } from "../src/domain/goal-market-provider-mapping.ts";

const distribution = () => ({ version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
  { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .1 },
  { home: 1, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
  { home: 2, away: 1, halfHome: 1, halfAway: 0, probability: .3 },
  { home: 0, away: 2, halfHome: 0, halfAway: 1, probability: .4 },
] });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const market = (definition, input = distribution()) => {
  const derived = deriveGoalMarket(input, definition);
  assert.equal(derived.available, true, JSON.stringify(derived));
  return derived.market;
};
const probability = (value, key) => value.selections.find((selection) => selection.key === key).winProbability;
const context = (overrides = {}) => ({ status: "finished-regulation", cycleEligibility: { eligible: true },
  regulationScore: { verified: true, period: "regulation-including-stoppage-time", home: 2, away: 1 },
  halfTimeScore: { verified: true, period: "first-half-including-stoppage-time", home: 1, away: 0 }, ...overrides });

test("score distributions reject invalid mass, duplicated paths, impossible halves, extra fields and nonfinite probabilities", () => {
  for (const change of [
    (value) => { value.states[0].probability = NaN; },
    (value) => { value.states[0].probability = 0; },
    (value) => { value.states[0].probability = .2; },
    (value) => { value.states[0].halfHome = 1; },
    (value) => { value.states[0].halfAway = null; },
    (value) => { value.states[0].home = -1; },
    (value) => { value.states[0].invented = true; },
    (value) => { value.states.push({ ...value.states[0] }); },
    (value) => { value.version = "unknown"; },
  ]) { const value = distribution(); change(value); assert.throws(() => parseScoreDistribution(value)); }
  const input = distribution(), parsed = parseScoreDistribution(input);
  input.states[0].home = 99;
  assert.equal(parsed.states[0].home, 0);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.states) && Object.isFrozen(parsed.states[0]));
});

test("unknown tail mass and absent joint half-time information never become normalized or independent probabilities", () => {
  const input = distribution(); input.states[0].probability = .05; input.unrepresentedProbability = .05;
  assert.equal(parseScoreDistribution(input).unrepresentedProbability, .05);
  assert.deepEqual(deriveGoalMarket(input, goalTotalsMarket(2.5)), { available: false, reason: "unrepresented-score-mass" });
  const noHalf = distribution(); noHalf.states = noHalf.states.map((state) => ({ ...state, halfHome: null, halfAway: null }));
  assert.equal(deriveGoalMarket(noHalf, goalResultMarket()).available, true);
  for (const definition of [goalResultMarket("half-time"), goalResultMarket("second-half"), goalHalfFullMarket()]) {
    assert.deepEqual(deriveGoalMarket(noHalf, definition), { available: false, reason: "missing-half-time-distribution" });
  }
});

test("legacy goal event semantics derive coherently from one joint distribution and keep deterministic selection ties", () => {
  const result = market(goalResultMarket());
  close(probability(result, "home"), .5); close(probability(result, "draw"), .1); close(probability(result, "away"), .4);
  assert.equal(result.selection, "home");
  close(probability(market(goalDoubleChanceMarket()), "home-away"), .9);
  close(probability(market(goalTotalsMarket(2.5)), "over"), .3);
  close(probability(market(goalBothTeamsScoreMarket()), "yes"), .3);
  const parity = market(goalParityMarket()); close(probability(parity, "odd"), .5); assert.equal(parity.selection, "odd");
});

test("all half-goal lines, team totals, half/second-half results, HT/FT, clean sheets and win-to-nil share exact score predicates", () => {
  close(probability(market(goalTotalsMarket(.5)), "over"), .9);
  close(probability(market(goalTotalsMarket(1.5)), "over"), .7);
  close(probability(market(goalTotalsMarket(3.5)), "over"), 0);
  close(probability(market(goalTotalsMarket(1.5, "home")), "over"), .3);
  close(probability(market(goalResultMarket("half-time")), "home"), .3);
  close(probability(market(goalResultMarket("second-half")), "draw"), .4);
  const halfFull = market(goalHalfFullMarket());
  close(probability(halfFull, "draw-home"), .2); close(probability(halfFull, "home-away"), 0);
  close(probability(market(goalCleanSheetMarket("home")), "yes"), .3);
  close(probability(market(goalWinToNilMarket("home")), "yes"), .2);
});

test("Asian integer and quarter lines retain push and partial outcomes rather than inventing binary hit rates", () => {
  const zero = market(goalAsianHandicapMarket(0));
  close(zero.selections[0].outcomes.push, .1); close(zero.selections[0].outcomes.win, .5);
  const quarter = market(goalAsianHandicapMarket(.25));
  close(quarter.selections[0].outcomes["half-win"], .1); close(quarter.selections[0].winProbability, .6);
  const negative = market(goalAsianHandicapMarket(-1.25));
  close(negative.selections[0].outcomes["half-loss"], .5); close(negative.selections[0].outcomes.loss, .5);
  const total = market(goalTotalsMarket(2.75, "total", "full-time", "asian"));
  close(total.selections[0].outcomes["half-win"], .3); close(total.selections[1].outcomes["half-loss"], .3);
  for (const selection of [zero, quarter, negative, total].flatMap((value) => value.selections)) {
    close(Object.values(selection.outcomes).reduce((sum, value) => sum + value, 0), 1);
  }
  assert.throws(() => goalTotalsMarket(2));
  assert.throws(() => goalAsianHandicapMarket(.1));
});

test("European handicap, exact scores and explicit combinations preserve complementary membership, not aggregate-only sums", () => {
  close(probability(market(goalEuropeanHandicapMarket(-1)), "draw"), .5);
  const exact = goalExactScoreMarket([{ home: 0, away: 0 }, { home: 1, away: 0 }], "full-time", true);
  close(probability(market(exact), "other"), .7);
  assert.equal(deriveGoalMarket(distribution(), goalExactScoreMarket([{ home: 0, away: 0 }, { home: 1, away: 0 }])).reason, "incomplete-partition");
  const combo = goalCombinationMarket("result-btts", "Result and BTTS", [
    { key: "yes", label: "Home and BTTS", rule: { kind: "all", rules: [{ kind: "result", result: "home" }, { kind: "both-teams-score", yes: true }] } },
    { key: "no", label: "Other", rule: { kind: "none", rules: [{ kind: "exact-score", home: 2, away: 1 }] } },
  ]);
  close(probability(market(combo), "yes"), .3);
  const broken = structuredClone(goalResultMarket()); broken.selections[1].rule = { kind: "result", result: "home" };
  // At this fixture mass the repeated home/gap-draw aggregate happens to differ; membership checking protects every path.
  assert.equal(deriveGoalMarket(distribution(), broken).reason, "incomplete-partition");
  const derived = market(goalResultMarket());
  assert.ok(Object.isFrozen(derived.definition) && Object.isFrozen(derived.definition.selections[0].rule));
});

test("settlement uses only final verified regulation/half-time evidence and respects cycle voids and administrative results", () => {
  for (const status of ["scheduled", "live", "unknown"]) assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ status })).status, "pending");
  for (const status of ["postponed", "canceled", "abandoned", "awarded"]) assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ status })).status, "void");
  assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ cycleEligibility: { eligible: false, reason: "cutoff-invalidated" } })).status, "void");
  for (const status of ["finished-regulation", "finished-extra-time", "finished-penalties"]) {
    assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ status })).status, "correct");
    assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ status, regulationScore: null })).status, "pending");
    assert.equal(settleGoalSelection(goalResultMarket(), "home", context({ status,
      regulationScore: { verified: false, period: "regulation-including-stoppage-time", home: 2, away: 1 } })).status, "pending");
  }
  assert.equal(settleGoalSelection(goalHalfFullMarket(), "home-home", context({ halfTimeScore: null })).status, "pending");
  assert.equal(settleGoalSelection(goalResultMarket(), "foreign", context()).status, "unavailable");
});

test("quarter/push settlements and corrections apply to the same supplied selected rule without changing forecast fields", () => {
  const full = { verified: true, period: "regulation-including-stoppage-time", home: 1, away: 0 };
  assert.equal(settleGoalSelection(goalAsianHandicapMarket(-1), "home", context({ regulationScore: full })).status, "push");
  assert.equal(settleGoalSelection(goalAsianHandicapMarket(-.75), "home", context({ regulationScore: full })).status, "half-win");
  assert.equal(settleGoalSelection(goalAsianHandicapMarket(-1.25), "home", context({ regulationScore: full })).status, "half-loss");
  const definition = goalResultMarket(), before = JSON.stringify(definition);
  assert.equal(settleGoalSelection(definition, "home", context()).status, "correct");
  assert.equal(settleGoalSelection(definition, "home", context({ regulationScore: { ...full, home: 0, away: 1 }, halfTimeScore: null })).status, "incorrect");
  assert.equal(JSON.stringify(definition), before);
});

test("provider mapping requires the exact observed bet identity, name and complete selection labels", () => {
  const definition = goalTotalsMarket(1.5), mapping = { betId: 55, betName: "Synthetic Goal Lines", definition,
    providerLabels: { over: "Over 1.5", under: "Under 1.5" } };
  const catalog = new Map([[55, mapping.betName]]), observation = { betId: 55, betName: mapping.betName,
    values: [{ label: "Over 1.5", odd: "1.8" }, { label: "Under 1.5", odd: "2.2" }] };
  assert.equal(deriveMappedGoalMarket(distribution(), mapping, catalog, observation).available, true);
  for (const changed of [{ ...observation, betId: 56 }, { ...observation, betName: "Renamed" }]) {
    assert.equal(deriveMappedGoalMarket(distribution(), mapping, catalog, changed).reason, "unverified-provider-bet");
  }
  assert.equal(deriveMappedGoalMarket(distribution(), mapping, null, observation).reason, "unverified-provider-bet");
  assert.equal(deriveMappedGoalMarket(distribution(), mapping, catalog, { ...observation, values: observation.values.slice(0, 1) }).reason, "incomplete-provider-group");
  assert.equal(deriveMappedGoalMarket(distribution(), { ...mapping, providerLabels: { over: "Over 1.5" } }, catalog, observation).reason, "invalid-mapping");
});
