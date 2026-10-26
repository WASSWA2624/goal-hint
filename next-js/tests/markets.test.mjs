import assert from "node:assert/strict";
import test from "node:test";
import {
  checkMarketConsistency,
  chooseMarketSelection,
  isMarketFamily,
  isMarketSelection,
  MARKET_RULE_VERSION,
  marketRules,
  marketSelections,
  MarketValidationError,
  presentMarketProbabilities,
  PROBABILITY_DISPLAY_VERSION,
  validateMarketGroup,
  validateMarketSnapshot,
} from "../src/domain/markets.ts";

const period = "regulation-including-stoppage-time";
const matchResult = (home = 0.4, draw = 0.3, away = 0.3) => ({
  "home-win": home,
  draw,
  "away-win": away,
});
const totals = (over = 0.6, under = 0.4) => ({ "over-2.5": over, "under-2.5": under });
const btts = (yes = 0.6, no = 0.4) => ({ yes, no });
const candidate = (probabilities, source = "ai", extra = {}) => ({ source, period, probabilities, ...extra });
const resultCandidate = (probabilities = matchResult(), source) => candidate(probabilities, source);
const totalCandidate = (probabilities = totals(), source) => candidate(probabilities, source, { line: 2.5 });
const bttsCandidate = (probabilities = btts(), source) => candidate(probabilities, source);

function accepted(family, input) {
  const checked = validateMarketGroup(family, input);
  assert.equal(checked.valid, true, `${family}: ${checked.reason}`);
  return checked.markets;
}

function rejected(family, input, reason) {
  assert.deepEqual(validateMarketGroup(family, input), { valid: false, reason });
}

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeeplyFrozen(child);
}

function freezeDeeply(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) freezeDeeply(child);
  return Object.freeze(value);
}

test("market codes and selection orders are stable and independent of display labels", () => {
  assert.deepEqual(Object.keys(marketSelections), [
    "match-result", "double-chance", "total-goals", "both-teams-to-score",
  ]);
  assert.deepEqual(marketSelections["match-result"], ["home-win", "draw", "away-win"]);
  assert.deepEqual(marketSelections["double-chance"], ["home-or-draw", "away-or-draw", "home-or-away"]);
  assert.deepEqual(marketSelections["total-goals"], ["over-2.5", "under-2.5"]);
  assert.deepEqual(marketSelections["both-teams-to-score"], ["yes", "no"]);
  assert.equal(marketRules.ruleVersion, MARKET_RULE_VERSION);
  assert.equal(marketRules.period, period);
  assert.equal(marketRules.probabilitySumTolerance, 0.001);
  assert.equal(marketRules.consistencyTolerance, 0.002);
  assertDeeplyFrozen(marketRules);
  assertDeeplyFrozen(marketSelections);
  for (const family of Object.keys(marketSelections)) {
    assert.equal(isMarketFamily(family), true);
    for (const selection of marketSelections[family]) assert.equal(isMarketSelection(family, selection), true);
    assert.equal(isMarketSelection(family, "Home win"), false);
  }
  for (const family of [null, undefined, "exact-score", "handicap", "MATCH-RESULT", "toString"]) {
    assert.equal(isMarketFamily(family), false);
    assert.equal(isMarketSelection(family, "home-win"), false);
    rejected(family, resultCandidate(), "unsupported-family");
  }
});

test("complete accepted match results derive double chance atomically with their source", () => {
  for (const source of ["ai", "api-football"]) {
    const input = resultCandidate(matchResult(0.45, 0.3, 0.25), source);
    const before = structuredClone(input);
    const [result, derived] = accepted("match-result", input);
    assert.deepEqual(result.probabilities, matchResult(0.45, 0.3, 0.25));
    assert.equal(result.selection, "home-win");
    assert.equal(result.selectedProbability, 0.45);
    assert.equal(result.source, source);
    assert.equal(result.period, period);
    assert.equal(result.ruleVersion, MARKET_RULE_VERSION);
    assert.deepEqual(derived.probabilities, {
      "home-or-draw": 0.75,
      "away-or-draw": 0.55,
      "home-or-away": 0.7,
    });
    assert.equal(derived.source, source);
    assert.equal(derived.derivedFrom, "match-result");
    assert.equal(derived.selection, "home-or-draw");
    assert.equal(derived.selectedProbability, 0.75);
    assert.equal(Object.values(derived.probabilities).reduce((sum, value) => sum + value), 2);
    assert.notEqual(result.probabilities, input.probabilities);
    assertDeeplyFrozen(result);
    assertDeeplyFrozen(derived);
    assert.deepEqual(input, before);
    input.probabilities["home-win"] = 0.1;
    assert.equal(result.probabilities["home-win"], 0.45);
  }
  const [total] = accepted("total-goals", totalCandidate(totals(0.35, 0.65)));
  assert.equal(total.line, 2.5);
  assert.equal(total.selection, "under-2.5");
  assert.equal(total.selectedProbability, 0.65);
  const [both] = accepted("both-teams-to-score", bttsCandidate(btts(0.7, 0.3)));
  assert.equal(both.selection, "yes");
  assert.equal(both.selectedProbability, 0.7);
});

test("probability bounds reject nonfinite, coerced and certainty values in every source group", () => {
  const definitions = [
    ["match-result", resultCandidate, matchResult(), "home-win"],
    ["total-goals", totalCandidate, totals(), "over-2.5"],
    ["both-teams-to-score", bttsCandidate, btts(), "yes"],
  ];
  for (const [family, makeCandidate, probabilities, key] of definitions) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, 0, -0, 1, -0.01, 1.01, "0.4", true, {}]) {
      rejected(family, makeCandidate({ ...probabilities, [key]: value }), "invalid-probability");
    }
  }
});

test("complete groups require exact selection keys and never guess missing complements", () => {
  for (const [family, makeCandidate, probabilities, key] of [
    ["match-result", resultCandidate, matchResult(), "draw"],
    ["total-goals", totalCandidate, totals(), "under-2.5"],
    ["both-teams-to-score", bttsCandidate, btts(), "no"],
  ]) {
    const incomplete = { ...probabilities };
    delete incomplete[key];
    for (const input of [undefined, null, [], {}, incomplete, { ...probabilities, unknown: 0.1 }]) {
      rejected(family, { ...makeCandidate(), probabilities: input }, "incomplete-group");
    }
    const wrongKey = { ...incomplete, unknown: probabilities[key] };
    rejected(family, makeCandidate(wrongKey), "incomplete-group");
  }
  rejected("match-result", undefined, "missing-group");
  rejected("match-result", null, "invalid-candidate");
  rejected("match-result", [], "invalid-candidate");
  rejected("double-chance", candidate({ "home-or-draw": 0.7, "away-or-draw": 0.6, "home-or-away": 0.7 }), "derived-only");
});

test("candidate provenance, regulation period and total-goals line are explicit strict contracts", () => {
  for (const source of [undefined, null, "provider", "AI", ["ai", "api-football"]]) {
    rejected("match-result", resultCandidate(matchResult(), source === undefined ? null : source), "invalid-source");
  }
  const missingSource = resultCandidate();
  delete missingSource.source;
  rejected("match-result", missingSource, "invalid-source");
  for (const invalidPeriod of [undefined, null, "full-time", "extra-time", "penalties", "first-half"]) {
    rejected("match-result", { ...resultCandidate(), period: invalidPeriod }, "unsupported-period");
  }
  for (const line of [undefined, null, "2.5", 1.5, 3.5, NaN, Infinity]) {
    rejected("total-goals", { ...totalCandidate(), line }, "unsupported-line");
  }
  for (const family of ["match-result", "both-teams-to-score"]) {
    const input = family === "match-result" ? resultCandidate() : bttsCandidate();
    rejected(family, { ...input, line: 2.5 }, "unsupported-line");
    rejected(family, { ...input, line: undefined }, "unsupported-line");
  }
  for (const extra of [{ odds: 2.5 }, { confidence: "high" }, { confidence: 0.9 }, { evidenceCompleteness: 0.8 }]) {
    rejected("match-result", { ...resultCandidate(), ...extra }, "invalid-candidate");
  }
  rejected("match-result", candidate({ "home-win": 2.5, draw: 3, "away-win": 3.5 }), "invalid-probability");
});

test("canonical decimal sum boundaries include exactly 0.001 and reject values beyond it", () => {
  for (const home of [0.501, 0.499]) {
    const [market] = accepted("match-result", resultCandidate(matchResult(home, 0.2, 0.3)));
    assert.equal(market.probabilities["home-win"], home);
  }
  for (const probability of [0.501, 0.499]) {
    const [total] = accepted("total-goals", totalCandidate(totals(probability, 0.5)));
    const [both] = accepted("both-teams-to-score", bttsCandidate(btts(probability, 0.5)));
    assert.equal(total.probabilities["over-2.5"], probability);
    assert.equal(both.probabilities.yes, probability);
  }
  for (const home of [0.5010000000000001, 0.49899999999999994]) {
    rejected("match-result", resultCandidate(matchResult(home, 0.2, 0.3)), "invalid-sum");
    rejected("total-goals", totalCandidate(totals(home, 0.5)), "invalid-sum");
    rejected("both-teams-to-score", bttsCandidate(btts(home, 0.5)), "invalid-sum");
  }
  for (const probabilities of [matchResult(0.2, 0.2, 0.2), matchResult(0.5, 0.4, 0.4)]) {
    rejected("match-result", resultCandidate(probabilities), "invalid-sum");
  }
  const [result, derived] = accepted("match-result", resultCandidate(matchResult(0.1 + 0.2, 0.2, 0.5)));
  assert.equal(result.probabilities["home-win"], 0.30000000000000004);
  assert.deepEqual(derived.probabilities, { "home-or-draw": 0.5, "away-or-draw": 0.7, "home-or-away": 0.8 });
});

test("double-chance bounds can reject the whole match-result source group after valid sums", () => {
  rejected("match-result", resultCandidate(matchResult(0.9999999999999999, 1e-16, Number.MIN_VALUE)), "invalid-derived-probability");
  const snapshot = validateMarketSnapshot({
    "match-result": resultCandidate(matchResult(0.6, 0.4, Number.MIN_VALUE)),
  });
  assert.deepEqual(snapshot.markets["match-result"], { available: false, reason: "invalid-derived-probability" });
  assert.deepEqual(snapshot.markets["double-chance"], { available: false, reason: "invalid-derived-probability" });
  const [result, derived] = accepted("match-result", resultCandidate(matchResult(0.999, Number.MIN_VALUE, Number.MIN_VALUE)));
  assert.equal(result.selection, "home-win");
  assert.deepEqual(derived.probabilities, {
    "home-or-draw": 0.999, "away-or-draw": 1e-323, "home-or-away": 0.999,
  });
});

test("selection uses unrounded probability and exact ties use each specification order", () => {
  assert.equal(chooseMarketSelection("match-result", matchResult(1 / 3, 1 / 3, 1 / 3)), "home-win");
  assert.equal(chooseMarketSelection("match-result", matchResult(0.25, 0.375, 0.375)), "draw");
  assert.equal(chooseMarketSelection("match-result", matchResult(0.334, 0.332, 0.334)), "home-win");
  assert.equal(chooseMarketSelection("match-result", matchResult(0.3333, 0.3334, 0.3333)), "draw");
  assert.equal(chooseMarketSelection("total-goals", totals(0.5, 0.5)), "over-2.5");
  assert.equal(chooseMarketSelection("total-goals", totals(0.499999, 0.500001)), "under-2.5");
  assert.equal(chooseMarketSelection("both-teams-to-score", btts(0.5, 0.5)), "yes");
  assert.equal(chooseMarketSelection("both-teams-to-score", btts(0.499999, 0.500001)), "no");
  assert.equal(chooseMarketSelection("double-chance", {
    "home-or-draw": 0.7, "away-or-draw": 0.7, "home-or-away": 0.6,
  }), "home-or-draw");
  assert.equal(chooseMarketSelection("double-chance", {
    "home-or-draw": 0.5, "away-or-draw": 0.75, "home-or-away": 0.75,
  }), "away-or-draw");
  assert.throws(() => chooseMarketSelection("exact-score", { "1-0": 0.6 }), MarketValidationError);
  assert.throws(() => chooseMarketSelection("total-goals", { "over-2.5": 0.9 }), MarketValidationError);
  assert.throws(() => chooseMarketSelection("both-teams-to-score", btts(0.7, 0.7)), MarketValidationError);
});

test("both joint consistency inequalities include exactly 0.002 and reject beyond equality", () => {
  assert.deepEqual(checkMarketConsistency(matchResult(0.4, 0.2, 0.4), totals(0.3, 0.7), btts(0.502, 0.498)), []);
  assert.deepEqual(checkMarketConsistency(
    matchResult(0.4, 0.2, 0.4), totals(0.3, 0.7), btts(0.5020000000000001, 0.4979999999999999),
  ), ["btts-under-requires-draw"]);
  assert.deepEqual(checkMarketConsistency(matchResult(0.2, 0.6, 0.2), totals(0.7, 0.3), btts(0.298, 0.702)), []);
  assert.deepEqual(checkMarketConsistency(
    matchResult(0.2, 0.6, 0.2), totals(0.7, 0.3), btts(0.2979999999999999, 0.7020000000000001),
  ), ["draw-over-requires-btts"]);
  const failures = checkMarketConsistency(matchResult(0.4, 0.2, 0.4), totals(0.3, 0.7), btts(0.6, 0.4));
  assertDeeplyFrozen(failures);
  assert.throws(() => checkMarketConsistency({ draw: 0.3 }, totals(), btts()), MarketValidationError);
  assert.throws(() => checkMarketConsistency(matchResult(), totals(0.9, 0.9), btts()), MarketValidationError);
  assert.throws(() => checkMarketConsistency(matchResult(), totals(), btts(NaN, 0.4)), MarketValidationError);
});

test("consistent BTTS can exceed Over 2.5 because the 1-1 outcome satisfies both teams scoring", () => {
  // A feasible score distribution: 1-1: 0.5, 2-1: 0.2, 1-0: 0.15, 0-1: 0.15.
  const snapshot = validateMarketSnapshot({
    "match-result": resultCandidate(matchResult(0.35, 0.5, 0.15)),
    "total-goals": totalCandidate(totals(0.2, 0.8)),
    "both-teams-to-score": bttsCandidate(btts(0.7, 0.3)),
  });
  assert.deepEqual(snapshot.issues, []);
  assert.equal(snapshot.markets["both-teams-to-score"].market.probabilities.yes, 0.7);
  for (const availability of Object.values(snapshot.markets)) assert.equal(availability.available, true);
});

test("consistent groups remain available for provider-only and mixed sources, with no direct double-chance override", () => {
  for (const sources of [["api-football", "api-football", "api-football"], ["ai", "api-football", "ai"]]) {
    const snapshot = validateMarketSnapshot({
      "match-result": resultCandidate(matchResult(), sources[0]),
      "total-goals": totalCandidate(totals(), sources[1]),
      "both-teams-to-score": bttsCandidate(btts(), sources[2]),
      "double-chance": candidate({ "home-or-draw": 0.9, "away-or-draw": 0.8, "home-or-away": 0.3 }),
    });
    for (const availability of Object.values(snapshot.markets)) assert.equal(availability.available, true);
    assert.equal(snapshot.markets["double-chance"].market.source, sources[0]);
    assert.deepEqual(snapshot.markets["double-chance"].market.probabilities, {
      "home-or-draw": 0.7, "away-or-draw": 0.6, "home-or-away": 0.7,
    });
    assert.deepEqual(snapshot.issues, [{ family: "double-chance", reason: "derived-only" }]);
  }
});

test("joint source conflicts preserve every AI group and omit every participating fallback group", () => {
  const makeConflict = (sources) => ({
    "match-result": resultCandidate(matchResult(0.4, 0.2, 0.4), sources[0]),
    "total-goals": totalCandidate(totals(0.3, 0.7), sources[1]),
    "both-teams-to-score": bttsCandidate(btts(0.8, 0.2), sources[2]),
  });
  for (const sources of [
    ["ai", "ai", "api-football"],
    ["ai", "api-football", "ai"],
    ["api-football", "ai", "ai"],
    ["ai", "api-football", "api-football"],
    ["api-football", "ai", "api-football"],
    ["api-football", "api-football", "ai"],
  ]) {
    const snapshot = validateMarketSnapshot(makeConflict(sources));
    const groups = ["match-result", "total-goals", "both-teams-to-score"];
    for (const [index, family] of groups.entries()) {
      const availability = snapshot.markets[family];
      assert.equal(availability.available, sources[index] === "ai", `${sources}: ${family}`);
      if (!availability.available) assert.equal(availability.reason, "cross-market-conflict");
    }
    assert.equal(snapshot.markets["double-chance"].available, sources[0] === "ai");
    for (const issue of snapshot.issues) {
      assert.equal(issue.reason, "cross-market-conflict");
      assert.deepEqual(issue.relatedGroups, groups);
      assert.deepEqual(issue.constraints, ["btts-under-requires-draw"]);
    }
    assert.equal(snapshot.issues.length, sources.filter((source) => source === "api-football").length);
  }
  for (const source of ["ai", "api-football"]) {
    const snapshot = validateMarketSnapshot(makeConflict([source, source, source]));
    for (const availability of Object.values(snapshot.markets)) {
      assert.deepEqual(availability, { available: false, reason: "cross-market-conflict" });
    }
    assert.equal(snapshot.issues.length, 3);
  }
});

test("the second joint conflict applies the same deterministic source policy", () => {
  const snapshot = validateMarketSnapshot({
    "match-result": resultCandidate(matchResult(0.1, 0.8, 0.1), "api-football"),
    "total-goals": totalCandidate(totals(0.8, 0.2), "api-football"),
    "both-teams-to-score": bttsCandidate(btts(0.2, 0.8)),
  });
  assert.equal(snapshot.markets["match-result"].available, false);
  assert.equal(snapshot.markets["double-chance"].available, false);
  assert.equal(snapshot.markets["total-goals"].available, false);
  assert.equal(snapshot.markets["both-teams-to-score"].available, true);
  assert.deepEqual(snapshot.issues.map((issue) => issue.constraints), [
    ["draw-over-requires-btts"], ["draw-over-requires-btts"],
  ]);
});

test("missing, invalid and unsupported snapshot families remain unavailable without invented values", () => {
  const empty = validateMarketSnapshot({});
  for (const availability of Object.values(empty.markets)) {
    assert.deepEqual(availability, { available: false, reason: "missing-group" });
  }
  for (const input of [undefined, null, [], "markets"]) {
    const snapshot = validateMarketSnapshot(input);
    assert.deepEqual(snapshot.issues[0], { family: "snapshot", reason: "invalid-candidate" });
    assert.equal(Object.values(snapshot.markets).some((item) => item.available), false);
  }
  const partial = validateMarketSnapshot({
    "total-goals": totalCandidate(),
    "both-teams-to-score": bttsCandidate({ yes: 0.8 }),
    "double-chance": candidate({ "home-or-draw": 0.8, "away-or-draw": 0.8, "home-or-away": 0.4 }),
    "exact-score": candidate({ "1-0": 0.3 }),
  });
  assert.equal(partial.markets["total-goals"].available, true);
  assert.deepEqual(partial.markets["match-result"], { available: false, reason: "missing-group" });
  assert.deepEqual(partial.markets["double-chance"], { available: false, reason: "missing-group" });
  assert.deepEqual(partial.markets["both-teams-to-score"], { available: false, reason: "incomplete-group" });
  assert.equal(Object.hasOwn(partial.markets, "exact-score"), false);
  assert.ok(partial.issues.some((issue) => issue.family === "exact-score" && issue.reason === "unsupported-family"));
  assert.ok(partial.issues.some((issue) => issue.family === "double-chance" && issue.reason === "derived-only"));
});

test("snapshot output is immutable and deterministic across source and selection key ordering", () => {
  const original = {
    "both-teams-to-score": bttsCandidate({ no: 0.4, yes: 0.6 }),
    "unknown-z": null,
    "total-goals": totalCandidate({ "under-2.5": 0.4, "over-2.5": 0.6 }),
    "match-result": resultCandidate({ "away-win": 0.3, draw: 0.3, "home-win": 0.4 }),
    "unknown-a": null,
  };
  const before = structuredClone(original);
  const snapshot = validateMarketSnapshot(original);
  const reordered = {
    "unknown-a": null,
    "match-result": resultCandidate(),
    "total-goals": totalCandidate(),
    "unknown-z": null,
    "both-teams-to-score": bttsCandidate(),
  };
  assert.deepEqual(validateMarketSnapshot(reordered), snapshot);
  assert.equal(snapshot.policy, marketRules);
  assert.equal(snapshot.ruleVersion, MARKET_RULE_VERSION);
  assertDeeplyFrozen(snapshot);
  assert.deepEqual(original, before);
  const frozenInput = freezeDeeply(structuredClone(original));
  assert.deepEqual(validateMarketSnapshot(frozenInput), snapshot);
  assert.deepEqual(frozenInput, before);
  original["match-result"].probabilities["home-win"] = 0.9;
  assert.equal(snapshot.markets["match-result"].market.probabilities["home-win"], 0.4);
});

test("exclusive presentation allocates 100 whole percentages by largest remainders and listed ties", () => {
  for (const [probabilities, expected, selection] of [
    [matchResult(1 / 3, 1 / 3, 1 / 3), [34, 33, 33], "home-win"],
    [matchResult(0.334, 0.332, 0.334), [34, 33, 33], "home-win"],
    [matchResult(0.3333, 0.3334, 0.3333), [33, 34, 33], "draw"],
    [matchResult(0.501, 0.2, 0.3), [50, 20, 30], "home-win"],
    [matchResult(0.499, 0.2, 0.3), [50, 20, 30], "home-win"],
  ]) {
    const [market] = accepted("match-result", resultCandidate(probabilities));
    const before = structuredClone(market);
    const display = presentMarketProbabilities(market);
    assert.deepEqual(display.entries.map((entry) => entry.roundedPercent), expected);
    assert.equal(display.entries.reduce((sum, entry) => sum + entry.roundedPercent, 0), 100);
    assert.equal(display.selection, selection);
    assert.deepEqual(display.entries.map((entry) => entry.probability), Object.values(probabilities));
    assert.deepEqual(market, before);
    assert.equal(display.labelKey, "probability.estimated");
    assert.equal(display.ruleVersion, MARKET_RULE_VERSION);
    assert.equal(display.displayVersion, PROBABILITY_DISPLAY_VERSION);
    assert.equal(Object.hasOwn(display, "confidence"), false);
    assertDeeplyFrozen(display);
  }
});

test("display rounding never changes an unrounded winner even when percentages tie", () => {
  for (const [family, input, selection] of [
    ["total-goals", totalCandidate(totals(0.499999, 0.500001)), "under-2.5"],
    ["both-teams-to-score", bttsCandidate(btts(0.499999, 0.500001)), "no"],
  ]) {
    const [market] = accepted(family, input);
    const display = presentMarketProbabilities(market);
    assert.deepEqual(display.entries.map((entry) => entry.roundedPercent), [50, 50]);
    assert.equal(market.selection, selection);
    assert.equal(display.selection, selection);
    assert.equal(market.selectedProbability, 0.500001);
  }
});

test("extreme probabilities use approximate boundary labels while retaining even subnormal values", () => {
  for (const small of [0.000001, Number.MIN_VALUE]) {
    const [market] = accepted("total-goals", totalCandidate(totals(small, 0.9995)));
    const display = presentMarketProbabilities(market);
    assert.deepEqual(display.entries, [
      { selection: "over-2.5", probability: small, roundedPercent: 0, labelKey: "probability.less-than-one" },
      { selection: "under-2.5", probability: 0.9995, roundedPercent: 100, labelKey: "probability.more-than-ninety-nine" },
    ]);
    assert.equal(market.probabilities["over-2.5"], small);
    assert.equal(display.selection, "under-2.5");
  }
  const [market] = accepted("both-teams-to-score", bttsCandidate(btts(0.01, 0.99)));
  assert.deepEqual(presentMarketProbabilities(market).entries.map((entry) => entry.labelKey), [
    "probability.percent", "probability.percent",
  ]);
});

test("double-chance presentation independently rounds overlapping alternatives rather than allocating 100", () => {
  const [, market] = accepted("match-result", resultCandidate(matchResult(0.335, 0.333, 0.332)));
  const display = presentMarketProbabilities(market);
  assert.deepEqual(display.entries.map((entry) => entry.probability), [0.668, 0.665, 0.667]);
  assert.deepEqual(display.entries.map((entry) => entry.roundedPercent), [67, 67, 67]);
  assert.equal(display.entries.reduce((sum, entry) => sum + entry.roundedPercent, 0), 201);
  assert.equal(display.selection, "home-or-draw");
  const [, tied] = accepted("match-result", resultCandidate(matchResult(0.25, 0.5, 0.25)));
  assert.deepEqual(presentMarketProbabilities(tied).entries.map((entry) => entry.roundedPercent), [75, 75, 50]);
  assert.equal(tied.selection, "home-or-draw");
  const [, extreme] = accepted("match-result", resultCandidate(matchResult(0.999, Number.MIN_VALUE, Number.MIN_VALUE)));
  assert.deepEqual(presentMarketProbabilities(extreme).entries.map((entry) => entry.labelKey), [
    "probability.more-than-ninety-nine", "probability.less-than-one", "probability.more-than-ninety-nine",
  ]);
});

test("presentation rejects unsupported versions and invalid distributions instead of displaying guesses", () => {
  const [market] = accepted("total-goals", totalCandidate());
  assert.throws(() => presentMarketProbabilities({ ...market, family: "exact-score" }), MarketValidationError);
  assert.throws(() => presentMarketProbabilities({ ...market, ruleVersion: "future-rule" }), MarketValidationError);
  for (const metadata of [
    { selection: "under-2.5" }, { selection: "home-win" }, { selectedProbability: 0.9 },
    { period: "extra-time" }, { source: "provider" }, { line: 3.5 }, { line: undefined },
  ]) {
    assert.throws(() => presentMarketProbabilities({ ...market, ...metadata }), MarketValidationError);
  }
  for (const probabilities of [null, {}, { "over-2.5": 0.6 }, totals(0.8, 0.8), totals(1, 0), totals("0.6", 0.4)]) {
    assert.throws(() => presentMarketProbabilities({ ...market, probabilities }), MarketValidationError);
  }
  const [result, derived] = accepted("match-result", resultCandidate());
  assert.throws(() => presentMarketProbabilities({ ...result, line: 2.5 }), MarketValidationError);
  assert.throws(() => presentMarketProbabilities({ ...derived, derivedFrom: "total-goals" }), MarketValidationError);
  assert.throws(() => presentMarketProbabilities({ ...derived, derivedFrom: undefined }), MarketValidationError);
});
