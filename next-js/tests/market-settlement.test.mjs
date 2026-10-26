import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_RULE_VERSION } from "../src/domain/markets.ts";
import { settleMarketSelection } from "../src/domain/market-settlement.ts";

function context(home, away, overrides = {}) {
  return {
    status: "finished-regulation",
    cycleEligibility: { eligible: true },
    regulationScore: { verified: true, period: "regulation-including-stoppage-time", home, away },
    ...overrides,
  };
}

function assertOutcome(family, selection, input, status, reason) {
  const result = settleMarketSelection(family, selection, input);
  assert.deepEqual(result, { ruleVersion: MARKET_RULE_VERSION, status, reason });
  assert.ok(Object.isFrozen(result));
  return result;
}

test("match result and double chance settle independently from the same regulation result", () => {
  const selections = [
    ["match-result", "home-win"], ["match-result", "draw"], ["match-result", "away-win"],
    ["double-chance", "home-or-draw"], ["double-chance", "away-or-draw"], ["double-chance", "home-or-away"],
  ];
  for (const [home, away, correct] of [
    [3, 1, ["home-win", "home-or-draw", "home-or-away"]],
    [0, 0, ["draw", "home-or-draw", "away-or-draw"]],
    [1, 1, ["draw", "home-or-draw", "away-or-draw"]],
    [1, 3, ["away-win", "away-or-draw", "home-or-away"]],
  ]) {
    for (const [family, selection] of selections) {
      const matches = correct.includes(selection);
      assertOutcome(family, selection, context(home, away), matches ? "correct" : "incorrect",
        matches ? "selection-occurred" : "selection-did-not-occur");
    }
  }
});

test("total goals distinguishes two regulation goals from three including stoppage time", () => {
  for (const [home, away, over] of [[0, 0, false], [1, 1, false], [2, 0, false], [0, 2, false], [2, 1, true], [0, 3, true], [3, 0, true]]) {
    for (const [selection, matches] of [["over-2.5", over], ["under-2.5", !over]]) {
      assertOutcome("total-goals", selection, context(home, away), matches ? "correct" : "incorrect",
        matches ? "selection-occurred" : "selection-did-not-occur");
    }
  }
});

test("BTTS requires both teams to score and any zero score correctly settles No", () => {
  for (const [home, away, yes] of [[0, 0, false], [1, 0, false], [0, 1, false], [4, 0, false], [0, 4, false], [1, 1, true], [2, 1, true]]) {
    for (const [selection, matches] of [["yes", yes], ["no", !yes]]) {
      assertOutcome("both-teams-to-score", selection, context(home, away), matches ? "correct" : "incorrect",
        matches ? "selection-occurred" : "selection-did-not-occur");
    }
  }
});

test("extra-time and penalty finals require a separately verified regulation score", () => {
  for (const status of ["finished-extra-time", "finished-penalties"]) {
    const input = context(1, 1, { status, finalScore: { home: 3, away: 1 }, penaltyScore: { home: 5, away: 4 } });
    assertOutcome("match-result", "draw", input, "correct", "selection-occurred");
    assertOutcome("total-goals", "over-2.5", input, "incorrect", "selection-did-not-occur");
    assertOutcome("match-result", "draw", { ...input, regulationScore: null }, "pending", "missing-regulation-score");
    assertOutcome("match-result", "draw", { ...input, regulationScore: { verified: false } }, "pending", "unverified-regulation-score");
    for (const period of ["extra-time", "penalties", "full-match", "regulation", undefined]) {
      assertOutcome("match-result", "draw", { ...input, regulationScore: { ...input.regulationScore, period } }, "pending", "invalid-score-period");
    }
  }
});

test("live, scheduled and unknown fixtures never settle even with verified scores", () => {
  for (const status of ["live", "scheduled"]) {
    assertOutcome("match-result", "home-win", context(2, 0, { status }), "pending", "awaiting-final-result");
  }
  assertOutcome("match-result", "home-win", context(2, 0, { status: "unknown" }), "pending", "unknown-fixture-status");
});

test("ineligible cycles and void fixture statuses retain stable reasons", () => {
  for (const reason of ["postponed-cycle", "cutoff-invalidated", "ineligible-cycle"]) {
    for (const status of ["live", "finished-regulation", "canceled"]) {
      assertOutcome("match-result", "home-win", context(2, 0, { status, cycleEligibility: { eligible: false, reason } }), "void", reason);
    }
  }
  for (const [status, reason] of [
    ["postponed", "fixture-postponed"], ["canceled", "fixture-canceled"],
    ["abandoned", "fixture-abandoned"], ["awarded", "fixture-awarded"],
  ]) {
    assertOutcome("match-result", "home-win", context(2, 0, { status }), "void", reason);
    assertOutcome("match-result", "home-win", context(2, 0, { status, regulationScore: null }), "void", reason);
  }
});

test("missing or unsupported picks remain unavailable before eligibility or result adjudication", () => {
  for (const input of [null, undefined, context(2, 0), context(2, 0, { status: "canceled" }), context(2, 0, { cycleEligibility: { eligible: false, reason: "cutoff-invalidated" } })]) {
    for (const selection of [null, undefined]) {
      assertOutcome("match-result", selection, input, "unavailable", "missing-selection");
    }
    for (const [family, selection] of [
      ["exact-score", "2-0"], [undefined, "home-win"], [null, "home-win"],
      ["match-result", "HOME_WIN"], ["match-result", ""], ["match-result", "yes"],
      ["total-goals", "over-3.5"], ["both-teams-to-score", true],
    ]) {
      assertOutcome(family, selection, input, "unavailable", "unsupported-market-selection");
    }
  }
});

test("all final statuses remain pending without verified regulation scores", () => {
  for (const status of ["finished-regulation", "finished-extra-time", "finished-penalties"]) {
    for (const regulationScore of [null, undefined]) {
      assertOutcome("match-result", "draw", context(0, 0, { status, regulationScore }), "pending", "missing-regulation-score");
    }
    for (const verified of [false, undefined, null, "true", 1]) {
      assertOutcome("match-result", "draw", context(0, 0, { status, regulationScore: { verified, period: "regulation-including-stoppage-time", home: 0, away: 0 } }), "pending", "unverified-regulation-score");
    }
    for (const regulationScore of [0, "0-0", [], true]) {
      assertOutcome("match-result", "draw", context(0, 0, { status, regulationScore }), "pending", "invalid-regulation-score");
    }
  }
});

test("invalid counts reject coercion, nonintegers, nonfinite numbers and unsafe totals", () => {
  for (const value of [null, undefined, "0", "1", true, false, NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertOutcome("match-result", "home-win", context(value, 0), "pending", "invalid-regulation-score");
    assertOutcome("match-result", "home-win", context(0, value), "pending", "invalid-regulation-score");
  }
  assertOutcome("total-goals", "over-2.5", context(Number.MAX_SAFE_INTEGER, 1), "pending", "invalid-regulation-score");
  assertOutcome("total-goals", "over-2.5", context(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), "pending", "invalid-regulation-score");
});

test("invalid context and unmapped provider statuses fail closed without implicit conversion", () => {
  for (const input of [null, undefined, [], 0, "finished-regulation", {}, { status: "finished-regulation" }]) {
    assertOutcome("match-result", "draw", input, "pending", "invalid-context");
  }
  for (const cycleEligibility of [null, undefined, [], true, {}, { eligible: "true" }, { eligible: 1 }, { eligible: false }, { eligible: false, reason: "arbitrary" }]) {
    assertOutcome("match-result", "draw", context(0, 0, { cycleEligibility }), "pending", "invalid-context");
  }
  for (const status of [null, undefined, "FT", "AET", "PEN", "finished", true, 90]) {
    assertOutcome("match-result", "draw", context(0, 0, { status }), "pending", "invalid-context");
  }
});

test("settlement freezes results without changing or freezing caller-owned context", () => {
  const input = context(1, 1);
  const snapshot = structuredClone(input);
  const first = assertOutcome("match-result", "draw", input, "correct", "selection-occurred");
  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.cycleEligibility), false);
  assert.equal(Object.isFrozen(input.regulationScore), false);
  assert.throws(() => { first.status = "incorrect"; }, TypeError);
  input.regulationScore.home = 2;
  const correction = assertOutcome("match-result", "draw", input, "incorrect", "selection-did-not-occur");
  assert.equal(first.status, "correct");
  assert.notEqual(correction, first);
  assert.deepEqual(settleMarketSelection("match-result", "draw", input), correction);
});
