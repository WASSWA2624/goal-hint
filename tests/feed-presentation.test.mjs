import assert from "node:assert/strict";
import test from "node:test";
import { bestCardFamily, countryOptions, feedRowNumber, leagueOptions, noPickReason, paginationWindow } from "../src/domain/feed-presentation.ts";
import { cardFixture } from "./helpers/match-card-fixtures.mjs";

test("scrolling pagination mounts consecutive viewport pages with bounded overscan through page 10,000", () => {
  assert.deepEqual(paginationWindow(1, 1, 7), { from: 1, to: 1 });
  assert.deepEqual(paginationWindow(6, 3, 7), { from: 1, to: 6 });
  assert.deepEqual(paginationWindow(10_000, 1, 7), { from: 1, to: 15 });
  assert.deepEqual(paginationWindow(10_000, 5_000, 7), { from: 4_992, to: 5_014 });
  assert.deepEqual(paginationWindow(10_000, 10_000, 7), { from: 9_986, to: 10_000 });
  assert.deepEqual(paginationWindow(49, 25, 5, 0), { from: 25, to: 29 });

  // Every viewport is represented; mounting cost depends on viewport size, not the collection.
  for (const total of [1, 6, 49, 10_000, Number.MAX_SAFE_INTEGER]) for (const visible of [1, 7, 30]) {
    for (const requested of [1, 2, Math.floor(total / 2), total - 1, total, Number.MAX_SAFE_INTEGER]) {
      const { from, to } = paginationWindow(total, requested, visible);
      const count = Math.min(total, visible), first = Math.min(Math.max(1, requested), total - count + 1);
      assert.ok(Number.isSafeInteger(from) && Number.isSafeInteger(to));
      assert.ok(from >= 1 && to <= total && from <= to);
      assert.ok(from <= first && to >= first + count - 1);
      assert.ok(to - from + 1 <= Math.min(total, count + 16));
    }
  }
});

test("scrolling pagination rejects invalid totals and normalizes viewport inputs without NaNs", () => {
  for (const total of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(paginationWindow(total, 1, 7), { from: 0, to: 0 });
  }
  for (const first of [NaN, Infinity, -Infinity, -2, 0]) {
    assert.deepEqual(paginationWindow(100, first, 5, 0), { from: 1, to: 5 });
  }
  assert.deepEqual(paginationWindow(100, 10.9, 5.9, 2.9), { from: 8, to: 16 });
  assert.deepEqual(paginationWindow(100, 10, NaN, -1), { from: 10, to: 10 });
  assert.deepEqual(paginationWindow(100, 10, Infinity, NaN), { from: 2, to: 18 });
  assert.deepEqual(paginationWindow(100, 200, 500, 500), { from: 1, to: 100 });
  assert.deepEqual(paginationWindow(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER), { from: 1, to: Number.MAX_SAFE_INTEGER });
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

test("country filters show local flags for known countries and aliases without inventing international flags", () => {
  const countries = ["England", "Saudi-Arabia", "Côte d’Ivoire", "BRA", "World", "Unknown country"];
  const leagues = countries.map((country, index) => ({ id: String(index), name: country, country, logoUrl: null, fixtures: 1 }));
  const options = new Map(countryOptions(leagues).map((option) => [option.value, option.logoUrl]));
  assert.equal(options.get("England"), "/flags/gb-eng.svg");
  assert.equal(options.get("Saudi-Arabia"), "/flags/sa.svg");
  assert.equal(options.get("Côte d’Ivoire"), "/flags/ci.svg");
  assert.equal(options.get("BRA"), "/flags/br.svg");
  assert.equal(options.get("World"), null);
  assert.equal(options.get("Unknown country"), null);
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
