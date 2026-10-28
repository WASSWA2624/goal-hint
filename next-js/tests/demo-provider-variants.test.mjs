import assert from "node:assert/strict";
import test from "node:test";
import { demoApiFootballResponse, demoFixturesForDate, demoFixtureKickoff, createDemoApiFootballFetch,
  DEMO_START_DATE, DEMO_END_DATE } from "../src/server/demo/api-football.ts";

const minute = 60_000, finishedAt = Date.parse("2026-12-03T12:00:00Z");
const fixture = demoFixturesForDate("2026-11-01", finishedAt).find(row => row.fixture.status.short === "FT");
const at = demoFixtureKickoff(fixture.fixture.id) + 82 * minute;
const request = (endpoint, parameters = {}, now = at) => demoApiFootballResponse(endpoint, parameters, now);

test("live odds routing retains exact unpaginated envelopes and provider filter intersections", () => {
  const all = request("odds/live"), id = String(fixture.fixture.id), league = String(fixture.league.id);
  assert.deepEqual(Object.keys(all), ["get", "parameters", "errors", "results", "paging", "response"]);
  assert.equal(all.get, "odds/live"); assert.deepEqual(all.parameters, []); assert.deepEqual(all.errors, []);
  assert.deepEqual(all.paging, { current: 1, total: 1 }); assert.equal(all.results, all.response.length);
  assert.ok(all.response.some(row => row.fixture.id === fixture.fixture.id));
  const scoped = request("odds/live", { fixture: id, league, bet: "59" });
  assert.deepEqual(scoped.parameters, { fixture: id, league, bet: "59" });
  assert.equal(scoped.results, 1); assert.deepEqual(scoped.response[0].odds.map(bet => bet.id), [59]);
  assert.equal("bookmakers" in scoped.response[0], false);
  for (const parameters of [{ fixture: "1" }, { fixture: id, league: "1" }, { fixture: id, bet: "999999" }]) {
    assert.deepEqual(request("odds/live", parameters).response, []);
  }
  for (const parameters of [{ fixture: "0" }, { league: "-1" }, { bet: "NaN" }, { page: "2" },
    { season: "2025" }, { bookmaker: "8" }, { date: "2026-11-01" }, { timezone: "UTC" }]) {
    const invalid = request("odds/live", parameters);
    assert.equal(invalid.results, 0); assert.ok(invalid.errors[Object.keys(parameters)[0]]);
  }
});

test("the live catalog has its own IDs, filters and provider-shaped validation errors", () => {
  const catalog = request("odds/live/bets");
  assert.ok(catalog.results >= 8); assert.equal(catalog.results, catalog.response.length);
  assert.ok(catalog.response.every(row => Object.keys(row).join(",") === "id,name"));
  assert.deepEqual(request("odds/live/bets", { id: "59" }).response, [{ id: 59, name: "Fulltime Result" }]);
  assert.ok(request("odds/live/bets", { search: "extra time" }).response.every(row => row.name.toLowerCase().includes("extra time")));
  assert.deepEqual(request("odds/live/bets", { id: "59", search: "chance" }).response, []);
  assert.deepEqual(request("odds/live/bets", { id: "999999" }).response, []);
  for (const parameters of [{ id: "0" }, { search: "ab" }, { fixture: String(fixture.fixture.id) }]) {
    assert.ok(request("odds/live/bets", parameters).errors[Object.keys(parameters)[0]]);
  }
});

test("live routing spans covered reporting boundaries without exposing historical snapshots", () => {
  const first = demoFixturesForDate(DEMO_START_DATE, finishedAt).filter(row => row.fixture.status.short === "FT")
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)[0];
  const beforeFirst = demoFixtureKickoff(first.fixture.id) - 5 * minute;
  assert.ok(request("odds/live", {}, beforeFirst).response.some(row => row.fixture.id === first.fixture.id));
  const last = demoFixturesForDate(DEMO_END_DATE, finishedAt).filter(row => row.fixture.status.short === "FT")
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)[0];
  const afterLast = demoFixtureKickoff(last.fixture.id) + 110 * minute;
  assert.ok(request("odds/live", {}, afterLast).response.some(row => row.fixture.id === last.fixture.id));
  assert.deepEqual(request("odds/live", { fixture: String(last.fixture.id) }, finishedAt).response, []);
  assert.deepEqual(request("odds/live", {}, Date.parse("2025-12-01T12:00:00Z")).response, []);
});

test("the existing local transport serves live payloads without dispatching a real provider request", async () => {
  const transport = createDemoApiFootballFetch({ now: () => at });
  const response = await transport(`https://v3.football.api-sports.io/odds/live?fixture=${fixture.fixture.id}&bet=59`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), request("odds/live", { fixture: String(fixture.fixture.id), bet: "59" }));
  const refused = await transport("https://v3.football.api-sports.io/odds/live", { method: "POST" });
  assert.equal(refused.status, 405);
  await assert.rejects(transport("https://v3.football.api-sports.io/odds/live", { signal: AbortSignal.abort() }), { name: "AbortError" });
});
