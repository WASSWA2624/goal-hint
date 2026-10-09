import assert from "node:assert/strict";
import test from "node:test";
import { marketRules, validateMarketGroup } from "../src/domain/markets.ts";
import { evaluateMarketMetrics, EvaluationMetricsError } from "../src/server/evaluation/evaluation-metrics.ts";

// Hand-computed local outcomes test scoring only; they are not forecast-quality evidence.
const market = (family, probabilities, source = "ai") => {
  const parent = family === "double-chance" ? "match-result" : family;
  const result = validateMarketGroup(parent, { source, period: marketRules.period, probabilities, ...(family === "total-goals" ? { line: 2.5 } : {}) });
  if (!result.valid) throw new Error(`Synthetic market failed shared validation: ${result.reason}`);
  return result.markets.find((value) => value.family === family);
};
const result = (home, away, overrides = {}) => ({ status: "finished-regulation", cycleEligibility: { eligible: true },
  regulationScore: { verified: true, period: marketRules.period, home, away }, ...overrides });
const observation = (value, home, away, overrides) => ({ market: value, result: result(home, away, overrides) });
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const bin = (metrics, selection, lower) => metrics.calibration.find((value) => value.selection === selection && value.lower === lower);
const error = (run, reason) => assert.throws(run, (value) => value instanceof EvaluationMetricsError && value.reason === reason);

test("categorical result scores use all three original probabilities and one selected pick", () => {
  const value = market("match-result", { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  const metrics = evaluateMarketMetrics("match-result", [observation(value, 2, 0), observation(value, 0, 1)], [0, 0.5, 1], 2);
  assert.equal(metrics.count, 2); assert.equal(metrics.correct, 1); assert.equal(metrics.incorrect, 1); assert.equal(metrics.hitRate, 0.5);
  close(metrics.brier, (0.245 + 1.145) / 2); close(metrics.logLoss, (-Math.log(0.6) - Math.log(0.15)) / 2);
  close(metrics.calibrationError, (0.1 + 0.25 + 0.35) / 3);
  assert.equal(metrics.calibration.reduce((sum, value) => sum + value.count, 0), 6);
});

test("calibration reports selection-specific counts, mean probabilities and Wilson uncertainty", () => {
  const value = market("match-result", { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  const metrics = evaluateMarketMetrics("match-result", [observation(value, 2, 0), observation(value, 0, 1)], [0, 0.5, 1], 2);
  const home = bin(metrics, "home-win", 0.5), draw = bin(metrics, "draw", 0);
  assert.equal(home.count, 2); assert.equal(home.meanProbability, 0.6); assert.equal(home.observedFrequency, 0.5);
  close(home.interval.lower, 0.5 - Math.sqrt(1.5) / 3); close(home.interval.upper, 0.5 + Math.sqrt(1.5) / 3);
  assert.equal(draw.observedFrequency, 0); close(draw.interval.lower, 0); close(draw.interval.upper, 2 / 3);
  assert.deepEqual(bin(metrics, "draw", 0.5), { selection: "draw", lower: 0.5, upper: 1, count: 0,
    meanProbability: null, observedFrequency: null, interval: null });
});

test("calibration error weights unequal bands by observed count before averaging selections", () => {
  const low = market("both-teams-to-score", { yes: 0.2, no: 0.8 }), high = market("both-teams-to-score", { yes: 0.7, no: 0.3 });
  const metrics = evaluateMarketMetrics("both-teams-to-score", [observation(low, 1, 1), observation(low, 2, 1), observation(high, 0, 0)], [0, 0.5, 1], 1.96);
  assert.equal(bin(metrics, "yes", 0).count, 2); assert.equal(bin(metrics, "yes", 0.5).count, 1);
  assert.equal(bin(metrics, "yes", 0).observedFrequency, 1); assert.equal(bin(metrics, "yes", 0.5).observedFrequency, 0);
  close(metrics.calibrationError, (2 * 0.8 + 0.7) / 3);
  assert.notEqual(metrics.calibrationError, (0.8 + 0.7) / 2);
});

test("binary Brier uses both supplied probabilities without normalizing an accepted tolerance", () => {
  const value = market("total-goals", { "over-2.5": 0.6, "under-2.5": 0.3995 });
  const metrics = evaluateMarketMetrics("total-goals", [observation(value, 2, 1)], [0, 0.5, 1], 1.96);
  close(metrics.brier, ((0.6 - 1) ** 2 + 0.3995 ** 2) / 2); close(metrics.logLoss, -Math.log(0.6));
  close(metrics.calibrationError, (0.4 + 0.3995) / 2);
  assert.equal(bin(metrics, "under-2.5", 0).meanProbability, 0.3995);
  assert.equal(metrics.hitRate, 1); assert.equal(value.probabilities["under-2.5"], 0.3995);
});

test("BTTS scores the regulation result and tracks the selected no pick once", () => {
  const value = market("both-teams-to-score", { yes: 0.2, no: 0.8 });
  const metrics = evaluateMarketMetrics("both-teams-to-score", [observation(value, 1, 1), observation(value, 0, 0)], [0, 0.5, 1], 1.96);
  assert.equal(metrics.correct, 1); assert.equal(metrics.incorrect, 1); assert.equal(metrics.count, 2);
  close(metrics.brier, (0.64 + 0.04) / 2); close(metrics.logLoss, (-Math.log(0.2) - Math.log(0.8)) / 2);
});

test("double chance averages three overlapping binary events per fixture without categorical normalization", () => {
  const value = market("double-chance", { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  assert.deepEqual(value.probabilities, { "home-or-draw": 0.85, "away-or-draw": 0.4, "home-or-away": 0.75 });
  const metrics = evaluateMarketMetrics("double-chance", [observation(value, 2, 0)], [0, 0.5, 1], 1.96);
  assert.equal(metrics.count, 1); assert.equal(metrics.correct, 1); assert.equal(metrics.incorrect, 0);
  close(metrics.brier, (0.15 ** 2 + 0.4 ** 2 + 0.25 ** 2) / 3);
  close(metrics.logLoss, (-Math.log(0.85) - Math.log(0.6) - Math.log(0.75)) / 3);
  close(metrics.calibrationError, (0.15 + 0.4 + 0.25) / 3);
  assert.equal(metrics.calibration.reduce((sum, entry) => sum + entry.count, 0), 3);
  assert.equal(bin(metrics, "home-or-draw", 0.5).observedFrequency, 1);
  assert.equal(bin(metrics, "away-or-draw", 0).observedFrequency, 0);
  assert.equal(bin(metrics, "home-or-away", 0.5).observedFrequency, 1);
});

test("draw makes two double-chance alternatives true while the headline pick remains one", () => {
  const value = market("double-chance", { "home-win": 0.6, draw: 0.25, "away-win": 0.15 });
  const metrics = evaluateMarketMetrics("double-chance", [observation(value, 0, 0), observation(value, 0, 2)], [0, 0.5, 1], 1.96);
  assert.equal(metrics.count, 2); assert.equal(metrics.correct, 1); assert.equal(metrics.incorrect, 1);
  const drawBrier = (0.15 ** 2 + 0.6 ** 2 + 0.75 ** 2) / 3;
  const awayBrier = (0.85 ** 2 + 0.6 ** 2 + 0.25 ** 2) / 3;
  close(metrics.brier, (drawBrier + awayBrier) / 2);
  const drawLoss = (-Math.log(0.85) - Math.log(0.4) - Math.log(0.25)) / 3;
  const awayLoss = (-Math.log(0.15) - Math.log(0.4) - Math.log(0.75)) / 3;
  close(metrics.logLoss, (drawLoss + awayLoss) / 2);
});

test("shared strict tie selection and exact band edges govern calibration", () => {
  const value = market("match-result", { "home-win": 0.4, draw: 0.4, "away-win": 0.2 });
  assert.equal(value.selection, "home-win");
  const metrics = evaluateMarketMetrics("match-result", [observation(value, 1, 1)], [0, 0.2, 0.4, 1], 1.96);
  assert.equal(metrics.incorrect, 1); assert.equal(bin(metrics, "home-win", 0.2).count, 0); assert.equal(bin(metrics, "home-win", 0.4).count, 1);
  assert.equal(bin(metrics, "away-win", 0).count, 0); assert.equal(bin(metrics, "away-win", 0.2).count, 1);
});

test("near-zero actual probabilities produce their unclipped finite logarithmic penalty", () => {
  const value = market("match-result", { "home-win": 1e-300, draw: 0.3999, "away-win": 0.6 });
  const metrics = evaluateMarketMetrics("match-result", [observation(value, 1, 0)], [0, 0.5, 1], 1.96);
  close(metrics.logLoss, -Math.log(1e-300)); assert.ok(metrics.logLoss > 690); close(metrics.brier, 1 + 0.3999 ** 2 + 0.6 ** 2);
  assert.equal(bin(metrics, "home-win", 0).meanProbability, 1e-300);
});

test("empty, pending, void and unverified results keep all scoring denominators empty", () => {
  const value = market("total-goals", { "over-2.5": 0.6, "under-2.5": 0.4 });
  const observations = [observation(value, 2, 1, { status: "scheduled" }), observation(value, 2, 1, { status: "live" }),
    observation(value, 2, 1, { status: "postponed" }), observation(value, 2, 1, { cycleEligibility: { eligible: false, reason: "cutoff-invalidated" } }),
    observation(value, 2, 1, { regulationScore: { verified: false } }), observation(value, 2, 1, { regulationScore: null })];
  for (const input of [[], observations]) {
    const metrics = evaluateMarketMetrics("total-goals", input, [0, 0.5, 1], 1.96);
    assert.equal(metrics.count, 0); assert.equal(metrics.correct, 0); assert.equal(metrics.incorrect, 0);
    for (const field of ["hitRate", "brier", "logLoss", "calibrationError"]) assert.equal(metrics[field], null);
    assert.ok(metrics.calibration.every((value) => value.count === 0 && value.meanProbability === null && value.observedFrequency === null && value.interval === null));
  }
});

test("pending and void observations do not change settled metrics or sample counts", () => {
  const value = market("both-teams-to-score", { yes: 0.7, no: 0.3 }), settled = observation(value, 2, 1);
  const metrics = evaluateMarketMetrics("both-teams-to-score", [settled, observation(value, 2, 1, { status: "abandoned" }),
    observation(value, 2, 1, { status: "unknown" })], [0, 0.5, 1], 1.96);
  assert.deepEqual(metrics, evaluateMarketMetrics("both-teams-to-score", [settled], [0, 0.5, 1], 1.96));
});

test("extra-time and penalty finishes score only verified regulation goals", () => {
  const value = market("match-result", { "home-win": 0.3, draw: 0.5, "away-win": 0.2 });
  const metrics = evaluateMarketMetrics("match-result", [observation(value, 1, 1, { status: "finished-extra-time" }),
    observation(value, 2, 2, { status: "finished-penalties" })], [0, 0.5, 1], 1.96);
  assert.equal(metrics.correct, 2); assert.equal(metrics.count, 2); close(metrics.logLoss, -Math.log(0.5));
});

test("malformed market metadata and incomplete distributions are rejected before scoring", () => {
  const valid = market("total-goals", { "over-2.5": 0.6, "under-2.5": 0.4 });
  for (const value of [{ ...valid, source: "made-up" }, { ...valid, period: "including-extra-time" }, { ...valid, line: 3.5 },
    { ...valid, ruleVersion: "another-rule" }, { ...valid, selectedProbability: 0.9 }, { ...valid, selection: "under-2.5" },
    { ...valid, probabilities: { "over-2.5": 0.6 } }, { ...valid, probabilities: { "over-2.5": Infinity, "under-2.5": 0.4 } },
    { ...valid, probabilities: { "over-2.5": 0, "under-2.5": 1 } }, { ...valid, probabilities: { "over-2.5": 0.5, "under-2.5": 0.4 } },
    { ...valid, extra: "unapproved" }, { ...valid, family: "both-teams-to-score" }]) {
    error(() => evaluateMarketMetrics("total-goals", [observation(value, 2, 1)], [0, 0.5, 1], 1.96), "invalid-observation");
  }
});

test("impossible fabricated double-chance values cannot masquerade as a derived source group", () => {
  const valid = market("double-chance", { "home-win": 0.4, draw: 0.3, "away-win": 0.3 });
  const fabricated = { ...valid, probabilities: { "home-or-draw": 0.2, "away-or-draw": 0.2, "home-or-away": 0.2 },
    selection: "home-or-draw", selectedProbability: 0.2 };
  error(() => evaluateMarketMetrics("double-chance", [observation(fabricated, 1, 0)], [0, 0.5, 1], 1.96), "invalid-observation");
});

test("invalid observations and non-fixed bins fail with clear configuration errors", () => {
  for (const bands of [[], [0, 1, 1], [0, 0.6, 0.5, 1], [0.1, 1], [0, 0.9], [0, NaN, 1], [0, , 1], [0, Infinity, 1], [0, -0.1, 1]]) {
    error(() => evaluateMarketMetrics("match-result", [], bands, 1.96), "invalid-configuration");
  }
  for (const z of [0, -1, NaN, Infinity, "1.96"]) error(() => evaluateMarketMetrics("match-result", [], [0, 1], z), "invalid-configuration");
  error(() => evaluateMarketMetrics("exact-score", [], [0, 1], 1.96), "invalid-configuration");
  error(() => evaluateMarketMetrics("match-result", {}, [0, 1], 1.96), "invalid-configuration");
  for (const input of [null, {}, { market: null, result: {} }, { market: market("match-result", { "home-win": 0.4, draw: 0.3, "away-win": 0.3 }), result: null }]) {
    error(() => evaluateMarketMetrics("match-result", [input], [0, 1], 1.96), "invalid-observation");
  }
});

test("large finite confidence parameters keep Wilson intervals finite and every output immutable", () => {
  const value = market("both-teams-to-score", { yes: 0.7, no: 0.3 });
  const metrics = evaluateMarketMetrics("both-teams-to-score", [observation(value, 2, 1)], [0, 0.5, 1], Number.MAX_VALUE);
  for (const entry of metrics.calibration.filter((entry) => entry.count > 0)) {
    assert.equal(entry.interval.lower, 0); assert.equal(entry.interval.upper, 1); assert.ok(Object.isFrozen(entry.interval));
  }
  assert.ok(Object.isFrozen(metrics)); assert.ok(Object.isFrozen(metrics.calibration)); assert.ok(metrics.calibration.every(Object.isFrozen));
  assert.throws(() => { metrics.count = 99; }, TypeError);
});

test("AI and provider source labels share identical metric semantics", () => {
  const distribution = { "home-win": 0.4, draw: 0.3, "away-win": 0.3 };
  const ai = evaluateMarketMetrics("match-result", [observation(market("match-result", distribution), 0, 2)], [0, 0.5, 1], 1.96);
  const provider = evaluateMarketMetrics("match-result", [observation(market("match-result", distribution, "api-football"), 0, 2)], [0, 0.5, 1], 1.96);
  assert.deepEqual(ai, provider);
});
