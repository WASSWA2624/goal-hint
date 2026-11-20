import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInPlayOdds } from "../src/server/football/api-football-normalize.ts";
import { marketOddsPrice, sameMarketOdds } from "../src/domain/in-play-odds.ts";
import { structuredInPlayOdds } from "../src/server/odds/in-play-odds-history.ts";
import { mapInPlayOdds, reviewedInPlayCatalog } from "../src/server/odds/in-play-odds-mapping.ts";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";
import { catalogResponse } from "./helpers/catalog-fixtures.mjs";

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

test("private source-less history is independent of offer order and records only reviewed period semantics", () => {
  const identified = { id: 59, name: "Fulltime Result", values: [price("Home", "1.45"), price("Away", "3.7")] };
  const unreviewed = { id: 187, name: "Unreviewed team or player selection", values: [
    price("Player / Side A", "3.15", { handicap: "-2.00", suspended: true }),
    price("Player / Side A", "3.16", { handicap: "-2.00", main: true }),
  ] };
  const source = normal([identified, unreviewed]).data;
  const reordered = normal([{ ...unreviewed, values: [...unreviewed.values].reverse() }, identified]).data;
  const first = structuredInPlayOdds(source, catalogue);
  assert.deepEqual(first, structuredInPlayOdds(reordered, catalogue));
  assert.equal(first.source.bookmakerId, null);
  assert.equal(first.markets[0].period, "full-time");
  assert.equal(first.markets[1].period, null);
  assert.equal(first.markets[1].review.reason, "catalog-entry-unavailable");
  assert.equal(first.markets[1].values[0].line, "-2");
  assert.deepEqual(first.markets[1].values.map(({ suspended }) => suspended), [true, false]);
});

test("valid sibling values from a malformed live group remain private and never become current offers", () => {
  const normalized = normal([{ id: 59, name: "Fulltime Result", values: [price("Home", "1.45"), price("Draw", "bad"),
    price("Away", "3.7")] }]);
  assert.equal(normalized.valid, true);
  assert.deepEqual(normalized.data.bets, []);
  assert.ok(normalized.missingCoverage.includes("in-play-bet-rejected:59"));
  const capture = structuredInPlayOdds(normalized.data, catalogue);
  assert.equal(capture.availability, "partial-offers");
  assert.equal(capture.markets[0].complete, false);
  assert.deepEqual(capture.markets[0].values.map(value => value.price), ["3.7", "1.45"]);
  assert.equal(mapInPlayOdds(normalized.data, catalogue, true).state, "unavailable");
});

test("the broad live catalog marks unnamed identities without rejecting named siblings", async () => {
  const provider = resultProvider({ now: () => now }, { respond: url => catalogResponse(url, [{ id: 59, name: "Fulltime Result" }, { id: 815, name: null }]) });
  const result = await provider.adapter.odds.inPlayBets({ priority: "enrichment", deadlineAt: now + 20_000, timeoutMs: 3000,
    maxRequests: 1, maxPages: 1, maxRows: 1000, maxResponseBytes: 100_000,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.data.map(value => value.id), [59]);
  assert.ok(result.completeness.missingCoverage.includes("odds-catalog-name:815"));
  assert.equal(provider.network[0].url.search, "");
});
