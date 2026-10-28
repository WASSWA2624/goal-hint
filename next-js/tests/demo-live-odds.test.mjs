import assert from "node:assert/strict";
import test from "node:test";
import { demoFixtureById, demoFixtureKickoff, demoFixtureModel, demoFixtureStatistics, demoFixturesForDate,
  demoScoreProbabilities } from "../src/server/demo/api-football.ts";
import { demoHash } from "../src/server/demo/api-football-catalog.ts";
import { demoLiveFixtureOdds, demoLiveOddsAvailable, demoLiveOddsBets } from "../src/server/demo/api-football-live-odds.ts";

const minute = 60_000, finishedAt = Date.parse("2026-11-03T12:00:00Z");
const completed = demoFixturesForDate("2026-11-01", finishedAt);
const fixture = completed.find(row => row.fixture.status.short === "FT"), id = fixture.fixture.id, kickoff = demoFixtureKickoff(id);
const read = (at, fixtureId = id, betId) => demoLiveFixtureOdds(demoFixtureById(fixtureId, at), demoFixtureModel(fixtureId), at,
  demoScoreProbabilities, { ...(betId === undefined ? {} : { betId }), statistics: demoFixtureStatistics(fixtureId, at) });
function activeAt(fixtureId = id, minutes = 82) {
  const start = demoFixtureKickoff(fixtureId) + minutes * minute + 14_000;
  for (let at = start; at < start + minute; at += 5000) if (!read(at, fixtureId).status.blocked) return at;
  throw new Error("Missing unblocked deterministic observation.");
}

test("live responses follow the official sample field tree and independent market namespace", () => {
  const at = activeAt(), row = read(at), canonical = demoFixtureById(id, at);
  assert.deepEqual(Object.keys(row).sort(), ["fixture", "league", "odds", "status", "teams", "update"]);
  assert.deepEqual(Object.keys(row.fixture).sort(), ["id", "status"]);
  assert.deepEqual(Object.keys(row.fixture.status).sort(), ["elapsed", "long", "seconds"]);
  assert.deepEqual(Object.keys(row.league).sort(), ["id", "season"]);
  assert.deepEqual(Object.keys(row.teams.home).sort(), ["goals", "id"]);
  assert.deepEqual(Object.keys(row.status).sort(), ["blocked", "finished", "stopped"]);
  assert.equal(row.fixture.status.elapsed, canonical.fixture.status.elapsed);
  assert.match(row.fixture.status.seconds, /^\d{2,3}:[0-5]\d$/u);
  assert.equal(row.fixture.status.long, canonical.fixture.status.long);
  assert.equal(row.teams.home.goals, canonical.goals.home); assert.equal(row.teams.away.goals, canonical.goals.away);
  assert.equal(row.league.id, canonical.league.id); assert.equal(row.league.season, 2026);
  assert.ok(Date.parse(row.update) <= at); assert.match(row.update, /\+00:00$/u);
  assert.equal(Date.parse(row.update) % 5000, 0);
  assert.ok(row.odds.length >= 8); assert.equal("bookmakers" in row, false);
  for (const bet of row.odds) {
    assert.deepEqual(Object.keys(bet).sort(), ["id", "name", "values"]);
    assert.deepEqual(demoLiveOddsBets.find(candidate => candidate.id === bet.id), { id: bet.id, name: bet.name });
    for (const value of bet.values) {
      assert.deepEqual(Object.keys(value).sort(), ["handicap", "main", "odd", "suspended", "value"]);
      assert.equal(typeof value.value, "string"); assert.match(value.odd, /^\d+(?:\.\d+)?$/u);
      assert.ok(Number(value.odd) >= 1.01 && Number(value.odd) <= 1000);
      assert.ok(value.handicap === null || typeof value.handicap === "string");
      assert.ok(value.main === null || typeof value.main === "boolean"); assert.equal(typeof value.suspended, "boolean");
    }
  }
  assert.equal(demoLiveOddsBets.find(bet => bet.id === 1).name, "Over/Under Extra Time");
  assert.equal(demoLiveOddsBets.find(bet => bet.id === 59).name, "Fulltime Result");
  assert.equal(demoLiveOddsBets.find(bet => bet.id === 69).name, "Both Teams to Score");
  assert.deepEqual(read(at, id, 59).odds.map(bet => bet.id), [59]);
  assert.equal(read(at, id, 1), null, "pre-match Match Winner ID 1 is not reused for the live full-time market");
  assert.equal(read(at, id, 9999), null);
});

test("live availability begins 5–15 minutes before kickoff and expires 5–20 minutes after the real synthetic finish", () => {
  const starts = kickoff - (5 + demoHash(id, 991) % 11) * minute;
  assert.equal(read(starts - 1), null);
  const before = read(starts);
  assert.ok(before); assert.equal(before.status.finished, true); assert.equal(before.status.blocked, true);
  assert.equal(before.fixture.status.elapsed, 0); assert.equal(before.fixture.status.seconds, "00:00");
  assert.equal(before.teams.home.goals, 0); assert.equal(before.teams.away.goals, 0);
  assert.ok(before.odds.every(bet => bet.values.every(value => value.suspended)));
  const final = kickoff + 110 * minute, removed = final + (5 + demoHash(id, 997) % 16) * minute;
  assert.equal(read(final).fixture.status.long, "Match Finished"); assert.equal(read(final).status.finished, true);
  assert.ok(read(removed - 1)); assert.equal(read(removed), null);
  assert.equal(read(finishedAt), null, "the endpoint exposes no historical odds after the removal window");
  assert.equal(demoLiveOddsAvailable(demoFixtureById(id, kickoff + 82 * minute), finishedAt), false, "a stale row cannot manufacture history");
  for (const row of completed.filter(candidate => ["TBD", "PST", "CANC", "ABD", "AWD", "WO"].includes(candidate.fixture.status.short))) {
    assert.equal(demoLiveOddsAvailable(row, finishedAt), false);
  }
});

test("live prices evolve on the provider clock using current scores, while main flags identify only duplicated values", () => {
  const at = activeAt(), row = read(at), later = read(at + 5 * minute);
  assert.deepEqual(row, read(at + 1));
  assert.notDeepEqual(row.odds.find(bet => bet.id === 59).values.map(value => value.odd),
    later.odds.find(bet => bet.id === 59).values.map(value => value.odd));
  const total = row.odds.find(bet => bet.id === 36), groups = Map.groupBy(total.values, value => `${value.value}:${value.handicap}`);
  assert.ok(total.values.some(value => value.main === true)); assert.ok(total.values.some(value => value.main === false));
  for (const values of groups.values()) {
    if (values.length > 1) assert.equal(values.filter(value => value.main === true).length, 1);
    else assert.notEqual(values[0].main, true);
  }
  const observed = row.teams.home.goals + row.teams.away.goals;
  assert.ok(total.values.filter(value => Number(value.handicap) < observed).every(value => value.suspended));
  const scores = row.odds.find(bet => bet.id === 68).values;
  for (const value of scores) {
    const [home, away] = value.value.split("-").map(Number);
    if (home < row.teams.home.goals || away < row.teams.away.goals) assert.equal(value.suspended, true);
  }
});

test("stopped and temporarily blocked markets suspend every value, with distinct extra-time markets", () => {
  const suspended = completed.find(row => demoFixtureById(row.fixture.id, demoFixtureKickoff(row.fixture.id) + 67 * minute).fixture.status.short === "SUSP");
  assert.ok(suspended);
  const stopped = read(demoFixtureKickoff(suspended.fixture.id) + 67 * minute, suspended.fixture.id);
  assert.deepEqual(stopped.status, { stopped: true, blocked: true, finished: false });
  assert.ok(stopped.odds.every(bet => bet.values.every(value => value.suspended)));
  const cup = completed.find(row => row.fixture.status.short === "AET");
  assert.ok(cup);
  const extra = read(activeAt(cup.fixture.id, 115), cup.fixture.id);
  assert.equal(extra.fixture.status.long, "Extra Time"); assert.equal(extra.status.finished, false);
  for (const bet of extra.odds.filter(bet => [59, 72, 69, 36, 33, 58, 39, 68].includes(bet.id))) assert.ok(bet.values.every(value => value.suspended));
  assert.ok(extra.odds.filter(bet => [1, 2, 9, 11].includes(bet.id)).some(bet => bet.values.some(value => !value.suspended)));
  assert.deepEqual(read(activeAt(cup.fixture.id, 115), cup.fixture.id, 2).odds.map(bet => bet.id), [2]);
});
