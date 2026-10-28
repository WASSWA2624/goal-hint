import assert from "node:assert/strict";
import test from "node:test";
import { demoApiFootballResponse, demoFixtureById, demoFixtureEvents, demoFixtureKickoff, demoFixturesForDate,
  demoFixtureStatistics, demoFixtureStatisticsPeriods } from "../src/server/demo/api-football.ts";

const complete = Date.parse("2026-12-01T12:00:00Z");
const fixtures = demoFixturesForDate("2026-10-27", complete);
const fixture = fixtures.find(row => row.fixture.status.short === "FT"
  && demoFixtureById(row.fixture.id, demoFixtureKickoff(row.fixture.id) + 70 * 60_000).fixture.status.short === "2H");
const id = fixture.fixture.id, kickoff = demoFixtureKickoff(id);
const at = minutes => kickoff + minutes * 60_000;
const value = (statistics, type) => statistics.find(row => row.type === type).value;

test("half statistics follow the observation clock and retain the unchanged full-match view", () => {
  assert.deepEqual(demoFixtureStatisticsPeriods(id, at(-1)), []);
  for (const minutes of [0, 25, 45, 59, 60, 70, 110]) {
    const periods = demoFixtureStatisticsPeriods(id, at(minutes));
    assert.equal(periods.length, 2);
    assert.deepEqual(periods.map(row => ({ team: row.team, statistics: row.statistics })), demoFixtureStatistics(id, at(minutes)));
    if (minutes < 60) {
      assert.ok(periods.every(row => row.secondHalf === null));
      assert.deepEqual(periods.map(row => row.firstHalf), periods.map(row => row.statistics));
    } else {
      assert.ok(periods.every(row => Array.isArray(row.secondHalf)));
    }
  }
});

test("halves conserve count statistics, possession and pass ratios without leaking later events", () => {
  for (const minutes of [70, 100, 110]) {
    const periods = demoFixtureStatisticsPeriods(id, at(minutes));
    for (const row of periods) {
      for (const statistic of row.statistics) {
        if (typeof statistic.value === "number") {
          assert.equal(value(row.firstHalf, statistic.type) + value(row.secondHalf, statistic.type), statistic.value, statistic.type);
        }
      }
      for (const half of [row.firstHalf, row.secondHalf]) {
        assert.equal(value(half, "Shots on Goal") + value(half, "Shots off Goal") + value(half, "Blocked Shots"), value(half, "Total Shots"));
        assert.equal(value(half, "Shots insidebox") + value(half, "Shots outsidebox"), value(half, "Total Shots"));
        const passes = value(half, "Total passes"), accurate = value(half, "Passes accurate");
        assert.ok(accurate >= 0 && accurate <= passes);
        assert.equal(value(half, "Passes %"), `${passes ? Math.round(accurate / passes * 100) : 0}%`);
      }
      const events = demoFixtureEvents(id, at(minutes)).filter(event => event.team.id === row.team.id);
      for (const [type, detail] of [["Yellow Cards", "Yellow Card"], ["Red Cards", "Red Card"]]) {
        assert.equal(value(row.firstHalf, type), events.filter(event => event.time.elapsed <= 45 && event.detail === detail).length);
        assert.equal(value(row.secondHalf, type), events.filter(event => event.time.elapsed > 45 && event.time.elapsed <= 90 && event.detail === detail).length);
      }
    }
    for (const half of ["firstHalf", "secondHalf"]) {
      assert.equal(periods.reduce((sum, row) => sum + Number.parseInt(value(row[half], "Ball Possession")), 0), 100);
    }
  }
});

test("first-half observations freeze and regulation halves exclude extra-time activity", () => {
  const first = demoFixtureStatisticsPeriods(id, at(45)).map(row => row.firstHalf);
  for (const minutes of [59, 70, 100, 110]) assert.deepEqual(demoFixtureStatisticsPeriods(id, at(minutes)).map(row => row.firstHalf), first);
  const extended = fixtures.find(row => row.fixture.status.short === "AET");
  assert.ok(extended);
  const start = demoFixtureKickoff(extended.fixture.id);
  const regulation = demoFixtureStatisticsPeriods(extended.fixture.id, start + 105 * 60_000);
  const finished = demoFixtureStatisticsPeriods(extended.fixture.id, start + 160 * 60_000);
  assert.deepEqual(finished.map(row => row.firstHalf), regulation.map(row => row.firstHalf));
  assert.deepEqual(finished.map(row => row.secondHalf), regulation.map(row => row.secondHalf));
  assert.ok(finished.some((row, index) => value(row.statistics, "Shots on Goal") > value(regulation[index].statistics, "Shots on Goal")));
});

test("unplayed and invalid fixtures do not acquire synthetic half statistics", () => {
  assert.deepEqual(demoFixtureStatisticsPeriods(1, complete), []);
  for (const row of fixtures.filter(row => ["TBD", "PST", "CANC", "AWD", "WO"].includes(row.fixture.status.short))) {
    assert.deepEqual(demoFixtureStatisticsPeriods(row.fixture.id, complete), []);
  }
});

test("half=true uses the provider's statistics_1h and statistics_2h response variant", () => {
  const parameters = { fixture: String(id), half: "true" };
  const response = demoApiFootballResponse("fixtures/statistics", parameters, complete);
  assert.equal(response.get, "fixtures/statistics");
  assert.deepEqual(response.parameters, parameters);
  assert.deepEqual(response.errors, []);
  assert.equal(response.results, 2);
  assert.deepEqual(response.paging, { current: 1, total: 1 });
  for (const row of response.response) {
    assert.deepEqual(Object.keys(row).sort(), ["statistics", "statistics_1h", "statistics_2h", "team"]);
    for (const key of ["statistics", "statistics_1h", "statistics_2h"]) {
      assert.ok(Array.isArray(row[key]));
      assert.equal(row[key].length, 18);
      for (const entry of row[key]) assert.deepEqual(Object.keys(entry).sort(), ["type", "value"]);
      assert.equal(typeof value(row[key], "expected_goals"), "string");
      assert.equal(typeof value(row[key], "goals_prevented"), "number");
    }
  }
  const omitted = demoApiFootballResponse("fixtures/statistics", { fixture: String(id) }, complete);
  const disabled = demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "false" }, complete);
  assert.deepEqual(disabled.response, omitted.response);
  assert.deepEqual(omitted.response, demoFixtureStatistics(id, complete));
});

test("team and type filters apply consistently to full-match and both half arrays", () => {
  const team = fixture.teams.home.id;
  for (const type of ["Total Shots", "Ball Possession", "Passes %", "expected_goals", "goals_prevented"]) {
    const response = demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "true", team: String(team), type }, complete);
    assert.deepEqual(response.errors, []);
    assert.equal(response.results, 1);
    assert.equal(response.response[0].team.id, team);
    for (const key of ["statistics", "statistics_1h", "statistics_2h"]) {
      assert.equal(response.response[0][key].length, 1);
      assert.equal(response.response[0][key][0].type, type);
    }
  }
  const absent = demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "true", type: "Unknown statistic" }, complete);
  assert.equal(absent.results, 2);
  assert.ok(absent.response.every(row => ["statistics", "statistics_1h", "statistics_2h"].every(key => row[key].length === 0)));
  assert.deepEqual(demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "true", team: "1" }, complete).response, []);
});

test("half response keeps unobserved periods empty and rejects invalid boolean parameters", () => {
  for (const minutes of [0, 25, 45, 59, 60, 70, 110]) {
    const response = demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "true" }, at(minutes));
    assert.deepEqual(response.errors, []);
    assert.equal(response.results, 2);
    assert.ok(response.response.every(row => row.statistics_1h.length > 0));
    assert.ok(response.response.every(row => row.statistics_2h.length === (minutes < 60 ? 0 : 18)));
  }
  assert.deepEqual(demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half: "true" }, at(-1)).response, []);
  for (const half of ["", "1", "0", "TRUE", "False", "yes"]) {
    const response = demoApiFootballResponse("fixtures/statistics", { fixture: String(id), half }, complete);
    assert.ok(response.errors.half);
    assert.equal(response.results, 0);
    assert.deepEqual(response.response, []);
  }
});
