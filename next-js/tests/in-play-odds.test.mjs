import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInPlayOdds } from "../src/server/football/api-football-normalize.ts";
import { marketOddsPrice, sameMarketOdds } from "../src/domain/in-play-odds.ts";
import { mapInPlayOdds, reviewedInPlayCatalog } from "../src/server/odds/in-play-odds-mapping.ts";

const now = Date.parse("2026-11-11T15:00:00Z");
const price = (value, odd, overrides = {}) => ({ value, odd, handicap: null, main: null, suspended: false, ...overrides });
const catalogue = reviewedInPlayCatalog([
  { id: 1, name: "Match Winner" }, { id: 59, name: "Fulltime Result" }, { id: 36, name: "Over/Under Line" },
]);
const normal = (bets, status = { stopped: false, blocked: false, finished: false }) => normalizeInPlayOdds({
  fixture: { id: 2871 }, league: { id: 39, season: 2026 },
  teams: { home: { id: 1 }, away: { id: 2 } },
  status, update: new Date(now - 1000).toISOString(), odds: bets,
}, { retrievedAt: now, endpoint: "/odds/live" });

test("live catalogue, authoritative duplicate and exact goal line yield in-play prices", () => {
  const normalized = normal([
    { id: 1, name: "Match Winner", values: [price("Home", "20"), price("Draw", "1.15"), price("Away", "6")] },
    { id: 59, name: "Fulltime Result", values: [price("Home", "1.4500"), price("Draw", "4.333"), price("Away", "8")] },
    { id: 36, name: "Over/Under Line", values: [
      price("Over", "1.975", { handicap: "2.50", main: true }), price("Over", "0", { handicap: "2.5", main: false, suspended: true }),
      price("Under", "1.9", { handicap: "2.5" }), price("Under", "2.11", { handicap: "3.5" }),
    ] },
  ]);
  assert.equal(normalized.valid, true);
  assert.deepEqual(mapInPlayOdds(normalized.data, catalogue), { state: "available", markets: [
    { family: "match-result", selections: [{ selection: "home-win", price: "1.45" }, { selection: "draw", price: "4.333" }, { selection: "away-win", price: "8" }] },
    { family: "total-goals", selections: [{ selection: "over-2.5", price: "1.975" }, { selection: "under-2.5", price: "1.9" }] },
  ] });
  assert.deepEqual(mapInPlayOdds(normalized.data, { 59: "Match Winner" }), { state: "unavailable", markets: [] });
});

test("a blocked fixture and a suspended primary price cannot leak stale alternatives", () => {
  const bets = [{ id: 59, name: "Fulltime Result", values: [
    price("Home", "1.6", { main: true, suspended: true }), price("Home", "1.55"),
    price("Draw", "4.8"), price("Away", "7"),
  ] }];
  const suspended = normal(bets);
  assert.equal(suspended.valid, true);
  assert.deepEqual(mapInPlayOdds(suspended.data, catalogue), { state: "unavailable", markets: [] });
  const blocked = normal(bets, { stopped: false, blocked: true, finished: false });
  assert.equal(blocked.valid, true);
  assert.deepEqual(mapInPlayOdds(blocked.data, catalogue), { state: "suspended", markets: [] });
});

test("exact current prices keep their precision and suspended markets do not borrow prices", () => {
  const odds = { kind: "in-play", checkedAt: now, prices: mapInPlayOdds(normal([
    { id: 59, name: "Fulltime Result", values: [price("Home", "1.975"), price("Draw", "4"), price("Away", "7")] },
  ]).data, catalogue) };
  assert.equal(marketOddsPrice(odds, "match-result", "home-win"), "1.975");
  assert.equal(marketOddsPrice(odds, "match-result", "draw"), "4.00");
  assert.equal(marketOddsPrice(odds, "double-chance", "home-or-draw"), null);
  const suspended = { ...odds, prices: { state: "suspended", markets: [] } };
  assert.equal(marketOddsPrice(suspended, "match-result", "home-win"), null);
  assert.equal(sameMarketOdds(odds, { ...odds, checkedAt: now + 30_000 }), true);
  assert.equal(sameMarketOdds(odds, suspended), false);
  assert.equal(sameMarketOdds(odds, null), false);
});
