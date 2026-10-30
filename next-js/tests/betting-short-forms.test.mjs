import assert from "node:assert/strict";
import test from "node:test";
import { bettingShortForms, bettingShortForm, formatMarketShortLabel, marketShortCode } from "../src/domain/betting-short-forms.ts";
import { countMetrics, eventMetrics } from "../src/domain/non-goal-market-definitions.ts";
import { goalMarketPeriods } from "../src/domain/score-distribution-markets.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { compactMarketName } from "../src/domain/compact-fixture-label.ts";
import { createMessages } from "../src/i18n/messages.ts";
import { predictionLabel } from "../src/domain/prediction-label.ts";

test("the dictionary covers every current metric, period and core card market", () => {
  for (const metric of new Set([...countMetrics, ...eventMetrics])) assert.ok(bettingShortForms.metrics[metric], metric);
  for (const period of goalMarketPeriods) assert.ok(bettingShortForms.periods[period], period);
  for (const family of Object.keys(marketSelections)) assert.equal(compactMarketName(family), bettingShortForms.markets[family].code);
  for (const dictionary of Object.values(bettingShortForms)) {
    assert.ok(Object.isFrozen(dictionary));
    for (const [key, form] of Object.entries(dictionary)) {
      assert.ok(form.code.trim() && form.label.trim(), key);
      assert.doesNotMatch(form.code + form.label, /[\p{Cc}<>]/u);
      assert.ok(["common", "readable"].includes(form.convention));
    }
  }
});

test("future markets compose explicit period, team, metric and exact lines", () => {
  assert.equal(formatMarketShortLabel({ market: "totals", metric: "corners", period: "first-half", scope: "home", line: 4.5 }), "1H H Corn. O/U 4.5");
  assert.equal(formatMarketShortLabel({ market: "asian-handicap", metric: "yellow-cards", period: "full-time", line: -1.25 }), "FT YC AH -1.25");
  assert.equal(formatMarketShortLabel({ market: "player-shots-on-target", period: "extra-time" }), "ET P SOT");
  assert.notEqual(bettingShortForms.metrics.cards.code, bettingShortForms.metrics["booking-points"].code);
  assert.notEqual(bettingShortForms.markets["asian-handicap"].code, bettingShortForms.markets["european-handicap"].code);
  assert.notEqual(bettingShortForms.periods["full-time"].code, bettingShortForms.periods["including-extra-time"].code);
});

test("source aliases and unknown terminology never invent a market meaning", () => {
  assert.equal(marketShortCode("BTTS"), "BTTS");
  assert.equal(marketShortCode("draw_no_bet"), "DNB");
  assert.equal(marketShortCode("h2h_3_way"), "1X2");
  assert.equal(marketShortCode("new-provider-market", "New provider market"), "New provider market");
  assert.equal(bettingShortForm(bettingShortForms.markets, "__proto__"), undefined);
  assert.equal(formatMarketShortLabel({ market: "custom", metric: "New count", fallback: "Custom market" }), "New count Custom market");
});

test("prediction labels use the dictionary while retaining translated descriptions and exact choices", () => {
  const messages = createMessages("en");
  for (const selection of ["home-win", "draw", "away-win", "home-or-draw", "away-or-draw", "home-or-away"])
    assert.equal(predictionLabel(messages, selection), bettingShortForms.predictions[selection].code);
  assert.equal(predictionLabel(messages, "over-3.25"), "O 3.25");
  assert.equal(predictionLabel(messages, "away", { rule: { kind: "asian-handicap", team: "away", line: -0.25 } }), "2 -0.25");
  assert.equal(predictionLabel(createMessages("en", { "prediction.short.home-win": "H" }), "home-win"), "H");
});
