import assert from "node:assert/strict";
import test from "node:test";
import { predictionLabel } from "../src/domain/prediction-label.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { createMessages } from "../src/i18n/messages.ts";

const messages = createMessages("en");
const expected = {
  "home-win": "Home win", draw: "Draw", "away-win": "Away win",
  "home-or-draw": "Home or draw", "away-or-draw": "Away or draw", "home-or-away": "Home or away",
  "over-2.5": "Over 2.5", "under-2.5": "Under 2.5", yes: "Both teams to score", no: "Not both teams to score",
};

test("every published core selection uses the same generic full words in every message catalog entry", () => {
  for (const selection of Object.values(marketSelections).flat()) {
    assert.equal(predictionLabel(messages, selection), expected[selection], selection);
    for (const prefix of ["market.selection", "market.pick", "market.pickPlain", "details.pick"]) {
      assert.equal(messages.text(`${prefix}.${selection}`, { home: "Arsenal", away: "Liverpool" }), expected[selection], `${prefix}.${selection}`);
    }
  }
});

test("legacy result and double-chance display codes expand without changing the stored selection", () => {
  for (const [selection, label] of [["1", "Home win"], ["X", "Draw"], ["2", "Away win"],
    ["1X", "Home or draw"], ["X1", "Home or draw"], ["X2", "Away or draw"],
    ["2X", "Away or draw"], ["12", "Home or away"], ["21", "Home or away"]]) {
    assert.equal(predictionLabel(messages, selection), label, selection);
  }
});

test("goal lines remain explicit for every supported decimal total instead of a fixed 2.5 label", () => {
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 2.25, 3, 10.75]) {
    for (const direction of ["over", "under"]) {
      const label = `${direction === "over" ? "Over" : "Under"} ${line}`;
      assert.equal(predictionLabel(messages, `${direction}-${line}`), label);
      assert.equal(predictionLabel(messages, direction, { line }), label);
      assert.equal(predictionLabel(messages, direction, { marketKey: `goal:full-time:totals:total:${line}:asian`, label: "Unrelated stored label" }), label);
      assert.equal(predictionLabel(messages, direction, { marketKey: `implied:full-time:corners:asian-total:total:${line}:all:provider-count-v1` }), label);
    }
  }
});

test("extended machine context distinguishes handicaps, counts, exact scores, events and half/full results", () => {
  for (const [selection, context, label] of [
    ["home", { marketKey: "goal:full-time:result", label: "Arsenal" }, "Home win"],
    ["home-draw", { marketKey: "goal:full-time:double-chance", label: "1X" }, "Home or draw"],
    ["home", { marketKey: "goal:full-time:asian-handicap:-1.5", label: "Arsenal -1.5" }, "Home -1.5"],
    ["away", { marketKey: "implied:full-time:corners:asian-handicap:total:-1.5:all:provider-count-v1" }, "Away +1.5"],
    ["1", { marketKey: "implied:full-time:corners:exact-count:total:none:all:provider-count-v1" }, "Exactly 1"],
    ["2-1", { marketKey: "goal:full-time:exact-score" }, "2:1"],
    ["home-away", { marketKey: "goal:full-time:half-full-result" }, "Home win / Away win"],
    ["home", { marketKey: "implied:full-time:corners:first-event-team:total:none:all:provider-event-v1" }, "Home team"],
    ["no", { marketKey: "goal:full-time:clean-sheet:home" }, "Home to concede"],
  ]) assert.equal(predictionLabel(messages, selection, context), label);
});

test("structured rules take precedence over arbitrary stored labels and generic selection aliases", () => {
  assert.equal(predictionLabel(messages, "home", { label: "Arsenal", rule: { kind: "asian-handicap", team: "away", line: 0.25 } }), "Away +0.25");
  assert.equal(predictionLabel(messages, "home", { marketKey: "goal:full-time:combination:result-total", label: "Home win and Over 1.5" }), "Home win and Over 1.5");
});

test("the shared formatter uses the caller's translated messages", () => {
  const translated = createMessages("en", { "market.selection.home-win": "Host win", "market.selection.over": "Above {line}" });
  assert.equal(predictionLabel(translated, "home-win"), "Host win");
  assert.equal(predictionLabel(translated, "over-1.5"), "Above 1.5");
});
