import assert from "node:assert/strict";
import test from "node:test";
import { bestCardFamily, countryOptions, feedRowNumber, leagueOptions, noPickReason, paginationItems } from "../src/domain/feed-presentation.ts";
import { cardFixture } from "./helpers/match-card-fixtures.mjs";

const pages = (current, total) => paginationItems(current, total).map((item) => item.kind === "gap" ? "…" : item.current ? `[${item.page}]` : String(item.page)).join(" ");

test("numbered pagination shows 1 2 3 4 … N and never more than seven slots", () => {
  assert.equal(pages(1, 0), "");
  assert.equal(pages(1, 1), "[1]");
  assert.equal(pages(2, 6), "1 [2] 3 4 5 6");
  assert.equal(pages(1, 49), "[1] 2 3 4 … 49");
  assert.equal(pages(3, 49), "1 2 [3] 4 … 49");
  assert.equal(pages(4, 49), "1 … 3 [4] 5 … 49");
  assert.equal(pages(25, 49), "1 … 24 [25] 26 … 49");
  assert.equal(pages(47, 49), "1 … 46 [47] 48 49");
  assert.equal(pages(49, 49), "1 … 46 47 48 [49]");
  assert.equal(pages(7, 7), "1 … 4 5 6 [7]");
  for (let total = 1; total <= 60; total++) for (let current = 1; current <= total; current++) {
    const items = paginationItems(current, total);
    assert.ok(items.length <= 7, `${current}/${total}`);
    assert.equal(items.filter((item) => item.kind === "page" && item.current).length, 1);
    const numbers = items.filter((item) => item.kind === "page").map((item) => item.page);
    assert.equal(numbers[0], 1); assert.equal(numbers.at(-1), total);
    assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  }
});

test("row numbers continue across pages", () => {
  assert.equal(feedRowNumber(1, 30, 0), 1);
  assert.equal(feedRowNumber(2, 30, 0), 31);
  assert.equal(feedRowNumber(3, 10, 9), 30);
});

test("the shown pick is the most likely available pick among selected markets, ties in policy order", () => {
  // Fixture probabilities: match result 54% (home), total goals 70% (under), BTTS 55% (no); double chance is derived.
  const fixture = cardFixture();
  assert.equal(bestCardFamily(fixture, ["match-result"]), "match-result");
  assert.equal(bestCardFamily(fixture, ["match-result", "total-goals"]), "total-goals");
  assert.equal(bestCardFamily(fixture, ["both-teams-to-score", "match-result"]), "both-teams-to-score");
  assert.equal(bestCardFamily(fixture, ["match-result", "double-chance", "total-goals", "both-teams-to-score"]), "double-chance");
  assert.equal(bestCardFamily(cardFixture({ forecast: null }), ["match-result", "total-goals"]), null);
  const tie = cardFixture();
  const goals = tie.forecast.markets.find((item) => item.market.family === "total-goals");
  goals.market = { ...goals.market, selectedProbability: tie.forecast.markets.find((item) => item.market.family === "match-result").market.selectedProbability };
  assert.equal(bestCardFamily(tie, ["total-goals", "match-result"]), "match-result");
});

test("league and country options order by fixture count, then name", () => {
  const leagues = [
    { id: "a", name: "Alpha League", country: "England", logoUrl: null, fixtures: 4 },
    { id: "b", name: null, country: "Spain", logoUrl: "https://media.example.test/b.png", fixtures: 9 },
    { id: "c", name: "Cup", country: "England", logoUrl: null, fixtures: 7 },
    { id: "d", name: "Delta", country: null, logoUrl: null, fixtures: 1 },
  ];
  assert.deepEqual(leagueOptions(leagues, "Unknown").map((option) => [option.value, option.label]), [["b", "Unknown"], ["c", "Cup"], ["a", "Alpha League"], ["d", "Delta"]]);
  assert.deepEqual(countryOptions(leagues).map((option) => [option.value, option.fixtures]), [["England", 11], ["Spain", 9]]);
});

test("missing picks explain themselves from stored cycle and update facts only", () => {
  const cycle = (state) => ({ state, mode: { open: "current", closed: "locked", void: "void" }[state], ordinal: 1, lockedAt: null, voidReason: null });
  const update = (prediction) => ({ prediction, result: "untracked" });
  assert.equal(noPickReason({ forecast: { markets: [] }, cycle: cycle("open"), update: update("current") }), "market");
  assert.equal(noPickReason({ forecast: null, cycle: null, update: update("unavailable") }), "unselected");
  assert.equal(noPickReason({ forecast: null, cycle: null, update: update("outside-window") }), "outside");
  assert.equal(noPickReason({ forecast: null, cycle: cycle("open"), update: update("updating") }), "updating");
  assert.equal(noPickReason({ forecast: null, cycle: cycle("open"), update: update("delayed") }), "failed");
  assert.equal(noPickReason({ forecast: null, cycle: cycle("open"), update: update("unavailable") }), "awaiting");
  assert.equal(noPickReason({ forecast: null, cycle: cycle("closed"), update: update("locked") }), "closed");
});
