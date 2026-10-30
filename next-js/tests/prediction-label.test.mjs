import assert from "node:assert/strict";
import test from "node:test";
import { predictionDescription, predictionLabel, predictionOutcome, predictionText } from "../src/domain/prediction-label.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { createMessages } from "../src/i18n/messages.ts";

const messages = createMessages("en");
const expected = {
  "home-win": "1", draw: "X", "away-win": "2",
  "home-or-draw": "1X", "away-or-draw": "X2", "home-or-away": "12",
  "over-2.5": "O 2.5", "under-2.5": "U 2.5", yes: "Yes", no: "No",
};
const words = {
  "home-win": "Home win", draw: "Draw", "away-win": "Away win",
  "home-or-draw": "Home or draw", "away-or-draw": "Away or draw", "home-or-away": "Home or away",
  "over-2.5": "Over 2.5", "under-2.5": "Under 2.5", yes: "Yes", no: "No",
};

test("every published core selection has a compact label and a clear independent definition", () => {
  for (const selection of Object.values(marketSelections).flat()) {
    assert.equal(predictionLabel(messages, selection), expected[selection], selection);
    assert.equal(predictionText(messages, selection), words[selection], selection);
    const definition = predictionDescription(messages, selection);
    assert.ok(definition.length > 0);
    assert.doesNotMatch(definition, /market\.selection\.|\{(?:home|away|line)\}/u);
    assert.deepEqual(predictionOutcome(messages, selection), { label: expected[selection], description: definition });
  }
});

test("legacy result and double-chance aliases use canonical display codes without changing stored values", () => {
  for (const [selection, label] of [["1", "1"], ["X", "X"], ["2", "2"],
    ["1X", "1X"], ["X1", "1X"], ["X2", "X2"],
    ["2X", "X2"], ["12", "12"], ["21", "12"]]) {
    assert.equal(predictionLabel(messages, selection), label, selection);
  }
});

test("goal lines remain explicit for every supported decimal total instead of a fixed 2.5 label", () => {
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 2.25, 3, 10.75]) {
    for (const direction of ["over", "under"]) {
      const label = `${direction === "over" ? "O" : "U"} ${line}`;
      assert.equal(predictionLabel(messages, `${direction}-${line}`), label);
      assert.equal(predictionLabel(messages, direction, { line }), label);
      assert.equal(predictionLabel(messages, direction, { marketKey: `goal:full-time:totals:total:${line}:asian`, label: "Unrelated stored label" }), label);
      assert.equal(predictionLabel(messages, direction, { marketKey: `implied:full-time:corners:asian-total:total:${line}:all:provider-count-v1` }), label);
    }
  }
});

test("extended machine context distinguishes handicaps, counts, exact scores, events and half/full results", () => {
  for (const [selection, context, label] of [
    ["home", { marketKey: "goal:full-time:result", label: "Arsenal" }, "1"],
    ["home-draw", { marketKey: "goal:full-time:double-chance", label: "1X" }, "1X"],
    ["home", { marketKey: "goal:full-time:asian-handicap:-1.5", label: "Arsenal -1.5" }, "1 -1.5"],
    ["away", { marketKey: "implied:full-time:corners:asian-handicap:total:-1.5:all:provider-count-v1" }, "2 +1.5"],
    ["1", { marketKey: "implied:full-time:corners:exact-count:total:none:all:provider-count-v1" }, "= 1"],
    ["2-1", { marketKey: "goal:full-time:exact-score" }, "2:1"],
    ["home-away", { marketKey: "goal:full-time:half-full-result" }, "1 / 2"],
    ["home", { marketKey: "implied:full-time:corners:first-event-team:total:none:all:provider-event-v1" }, "1"],
    ["no", { marketKey: "goal:full-time:clean-sheet:home" }, "No"],
  ]) assert.equal(predictionLabel(messages, selection, context), label);
});

test("structured rules take precedence over arbitrary stored labels and generic selection aliases", () => {
  assert.equal(predictionLabel(messages, "home", { label: "Arsenal", rule: { kind: "asian-handicap", team: "away", line: 0.25 } }), "2 +0.25");
  assert.equal(predictionLabel(messages, "home", { marketKey: "goal:full-time:combination:result-total", label: "Home win and Over 1.5" }), "Home win and Over 1.5");
});

test("the shared formatter uses the caller's translated messages", () => {
  const translated = createMessages("en", { "prediction.short.home-win": "H", "market.selection.home-win": "Host win",
    "prediction.short.over": "+{line}", "market.selection.over": "Above {line}" });
  assert.deepEqual(predictionOutcome(translated, "home-win"), { label: "H", description: "Host win" });
  assert.deepEqual(predictionOutcome(translated, "over-1.5"), { label: "+1.5", description: "Above 1.5" });
});

test("boolean answers retain the meaning of their own market and team", () => {
  assert.deepEqual(predictionOutcome(messages, "yes"), { label: "Yes", description: "Both teams score at least one goal" });
  assert.deepEqual(predictionOutcome(messages, "no"), { label: "No", description: "At least one team does not score" });
  for (const [rule, label, description] of [
    [{ kind: "both-teams-score", yes: false }, "No", "At least one team does not score"],
    [{ kind: "clean-sheet", team: "home", yes: true }, "Yes", "Home clean sheet"],
    [{ kind: "clean-sheet", team: "away", yes: false }, "No", "Away to concede"],
    [{ kind: "win-to-nil", team: "away", yes: true }, "Yes", "Away win to nil"],
    [{ kind: "win-to-nil", team: "home", yes: false }, "No", "Home not to win to nil"],
  ]) assert.deepEqual(predictionOutcome(messages, "irrelevant", { rule }), { label, description });
});

test("structured count, event and combined outcomes preserve their full meaning beside the compact code", () => {
  for (const [rule, label, description] of [
    [{ kind: "result", result: "home" }, "1", "Home win"],
    [{ kind: "result", result: "draw" }, "X", "Draw"],
    [{ kind: "result", result: "away" }, "2", "Away win"],
    [{ kind: "handicap-result", homeHandicap: -1, result: "away" }, "2", "Away win"],
    [{ kind: "double-chance", results: ["home", "draw"] }, "1X", "Home or draw"],
    [{ kind: "double-chance", results: ["draw", "away"] }, "X2", "Away or draw"],
    [{ kind: "double-chance", results: ["away", "home"] }, "12", "Home or away"],
    [{ kind: "total", metric: "total", direction: "over", line: 2.5 }, "O 2.5", "Over 2.5"],
    [{ kind: "asian-total", direction: "under", line: 1.25 }, "U 1.25", "Under 1.25"],
    [{ kind: "asian-handicap", team: "away", line: -0.25 }, "2 -0.25", "Away -0.25"],
    [{ kind: "odd-even", odd: true }, "Odd", "Odd"],
    [{ kind: "odd-even", odd: false }, "Even", "Even"],
    [{ kind: "exact-score", home: 2, away: 1 }, "2:1", "2:1"],
    [{ kind: "exact-count", count: 3 }, "= 3", "Exactly 3"],
    [{ kind: "other-count", excluded: [0, 1, 2] }, "Other", "Other count"],
    [{ kind: "event-occurs", position: "first", yes: true }, "Yes", "The specified event occurs"],
    [{ kind: "event-occurs", position: "last", yes: false }, "No", "The specified event does not occur"],
    [{ kind: "event-team", position: "first", team: "home" }, "1", "Home team"],
    [{ kind: "event-team", position: "last", team: "away" }, "2", "Away team"],
    [{ kind: "event-team", position: "last", team: "none" }, "None", "No event"],
    [{ kind: "half-full-result", half: "draw", full: "away" }, "X / 2", "Draw / Away win"],
    [{ kind: "all", rules: [{ kind: "result", result: "home" }, { kind: "total", metric: "total", direction: "over", line: 2.5 }] }, "1 & O 2.5", "Home win and Over 2.5"],
    [{ kind: "none", rules: [{ kind: "exact-score", home: 0, away: 0 }] }, "Other", "Other score"],
    [{ kind: "none", rules: [{ kind: "result", result: "home" }] }, "Other", "None of the specified outcomes"],
  ]) assert.deepEqual(predictionOutcome(messages, "irrelevant", { rule }), { label, description });
});
