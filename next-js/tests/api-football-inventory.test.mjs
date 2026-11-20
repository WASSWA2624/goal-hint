import assert from "node:assert/strict";
import test from "node:test";
import { apiFootballEndpoints } from "../src/server/football/api-football-contract.ts";
import { apiFootballInventory } from "../src/server/football/api-football-inventory.ts";

test("the versioned inventory accounts for each v3 endpoint and adapter selector", () => {
  const { version, transport, endpoints, coverageSelectors } = apiFootballInventory;
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  assert.equal(transport, apiFootballEndpoints, "Transport definitions stay authoritative for routing and paging");
  assert.deepEqual(Object.keys(endpoints).sort(), Object.keys(transport).sort());
  assert.deepEqual(Object.keys(coverageSelectors).sort(), Object.keys(transport).sort());
  assert.deepEqual([...new Set(Object.values(transport).map(({ path }) => path))].sort(), [
    "/coachs", "/countries", "/fixtures", "/fixtures/events", "/fixtures/headtohead", "/fixtures/lineups",
    "/fixtures/players", "/fixtures/rounds", "/fixtures/statistics", "/injuries", "/leagues", "/leagues/seasons",
    "/odds", "/odds/bets", "/odds/bookmakers", "/odds/live", "/odds/live/bets", "/odds/mapping", "/players",
    "/players/profiles", "/players/seasons", "/players/squads", "/players/teams", "/players/topassists",
    "/players/topredcards", "/players/topscorers", "/players/topyellowcards", "/predictions", "/sidelined", "/standings",
    "/status", "/teams", "/teams/countries", "/teams/seasons", "/teams/statistics", "/timezone", "/transfers", "/trophies", "/venues",
  ]);
  for (const [key, entry] of Object.entries(endpoints)) {
    assert.ok(entry.scope.length && entry.refresh && entry.historical && entry.traversal && entry.fields.rawReason, key);
    assert.ok(coverageSelectors[key].length, key);
    assert.equal(transport[key].paginated, entry.parameters.includes("page"), key);
    for (const selector of coverageSelectors[key]) assert.ok(selector.every(name => entry.parameters.includes(name)), key);
    for (const { parameter, maximumIds, delimiter } of entry.batch ?? []) {
      assert.ok(entry.parameters.includes(parameter), key);
      assert.equal(maximumIds, 20, key);
      assert.equal(delimiter, "-", key);
    }
    const paths = [...entry.fields.normalized, ...entry.fields.raw];
    assert.ok(paths.length, key);
    assert.equal(new Set(paths).size, paths.length, `Duplicate field disposition for ${key}`);
  }
});

test("paging, embedded details, independent odds namespaces and schema retention are explicit", () => {
  const { transport, endpoints, coverageSelectors, paging, raw, unavailable } = apiFootballInventory;
  const pageSizes = Object.fromEntries(Object.entries(transport).filter(([, value]) => value.paginated)
    .map(([key, value]) => [key, value.pageSize]));
  assert.deepEqual(pageSizes, { playerStatistics: 20, playerProfiles: 250, odds: 10, oddsMapping: 100 });
  assert.equal(paging.totalField, "paging.total");
  assert.ok(coverageSelectors.fixtures.some(selector => selector.includes("ids")));
  assert.deepEqual(coverageSelectors.fixtureHalfStatistics, [["fixture", "half"]]);
  assert.equal(endpoints.fixtureHeadToHead.adapter, "unimplemented");
  assert.equal(endpoints.fixturePlayerStatistics.adapter, "embedded");
  assert.ok(endpoints.fixturePlayerStatistics.fields.raw.includes("players.*.statistics.*.duels.won"));
  assert.ok(endpoints.predictions.fields.raw.includes("comparison"));
  assert.ok(endpoints.odds.fields.normalized.includes("bookmakers.*.bets.*.values.*.odd"));
  assert.ok(endpoints.inPlayOdds.fields.normalized.includes("odds.*.values.*.suspended"));
  assert.notEqual(transport.oddsBets.path, transport.inPlayOddsBets.path);
  assert.match(endpoints.odds.historical, /seven-day/u);
  assert.match(endpoints.inPlayOdds.historical, /No provider history/u);
  assert.ok(raw.preserve.includes("unknown nested properties"));
  assert.ok(raw.preserve.includes("explicit nulls"));
  assert.equal(raw.accountAccess, "administrator-only");
  assert.ok(raw.exclude.includes("credentials in any payload"));
  assert.ok(unavailable.standardFootballFields.includes("psychological states"));
});
