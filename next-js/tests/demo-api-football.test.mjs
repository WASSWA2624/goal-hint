import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY, DEMO_DAYS, demoFootballCatalog,
  demoFixturesForDate, demoFixtureById, demoDateAt, demoApiFootballResponse, demoFixtureEvents,
  demoFixtureLineups, demoFixtureStatistics, demoFixturePlayers, demoFixtureOdds, demoFixtureProbabilities,
  demoTeamStatistics, demoTeamForm, demoFixtureKickoff, createDemoApiFootballFetch } from "../src/server/demo/api-football.ts";
import { normalizeFixture, normalizeTeam, normalizeCompetition, normalizeStatistics, normalizeEvent,
  normalizeAvailability, normalizePlayerStatistics, normalizeFallbackPrediction, normalizeOdds,
  normalizeOddsCatalogEntry } from "../src/server/football/api-football-normalize.ts";
import { utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";

const now = Date.parse("2026-10-28T12:00:00+03:00"), finishedAt = Date.parse("2026-12-02T00:00:00Z");
const context = (endpoint) => ({ retrievedAt: utcInstantFromEpochMilliseconds(now), endpoint,
  verifyRegulationScore: () => true, verifyHalfTimeScore: () => true });
const request = (endpoint, parameters = {}, at = now) => demoApiFootballResponse(endpoint, parameters, at);

test("all 334 reporting days contain 560 unique, diverse matches with no double-booked teams", () => {
  assert.equal(DEMO_START_DATE, "2026-01-01"); assert.equal(DEMO_END_DATE, "2026-11-30");
  assert.equal(DEMO_DAYS, 334); assert.equal(DEMO_MATCHES_PER_DAY, 560);
  assert.equal(demoFootballCatalog.leagues.length, 56); assert.equal(demoFootballCatalog.teams.length, 3_360);
  const ids = new Set(), countries = new Set(), scores = new Set(), statuses = new Set();
  const lastPlayed = new Map();
  for (let day = 0; day < DEMO_DAYS; day += 1) {
    const date = demoDateAt(day), rows = demoFixturesForDate(date, now), todayTeams = new Set();
    assert.equal(rows.length, 560, date);
    for (const row of rows) {
      assert.ok(!ids.has(row.fixture.id)); ids.add(row.fixture.id);
      assert.equal(row.fixture.date.slice(0, 10), date);
      assert.equal(Date.parse(row.fixture.date), row.fixture.timestamp * 1_000);
      countries.add(row.league.country); statuses.add(row.fixture.status.short);
      scores.add(`${row.goals.home}:${row.goals.away}`);
      for (const team of [row.teams.home, row.teams.away]) {
        assert.ok(!todayTeams.has(team.id), `${team.id} double-booked on ${date}`); todayTeams.add(team.id);
        if (lastPlayed.has(team.id)) assert.equal(day - lastPlayed.get(team.id), 3);
        lastPlayed.set(team.id, day);
      }
    }
  }
  assert.equal(ids.size, 187_040); assert.equal(countries.size, 56); assert.ok(scores.size >= 40);
  for (const status of ["NS", "FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO", "TBD", "1H", "HT", "2H"]) assert.ok(statuses.has(status), status);
  for (const invalid of ["2025-12-31", "2026-12-01", "2026-02-30", "invalid"]) assert.deepEqual(demoFixturesForDate(invalid, now), []);
});

test("generator is deterministic and never publishes future scores, events or statistics", () => {
  const future = demoFixturesForDate("2026-11-30", now);
  assert.deepEqual(future, demoFixturesForDate("2026-11-30", now));
  const row = future.find((r) => r.fixture.status.short === "NS");
  assert.ok(row); assert.deepEqual(row.goals, { home: null, away: null });
  assert.deepEqual(row.score, { halftime: { home: null, away: null }, fulltime: { home: null, away: null },
    extratime: { home: null, away: null }, penalty: { home: null, away: null } });
  assert.deepEqual(demoFixtureEvents(row.fixture.id, now), []);
  assert.deepEqual(demoFixtureStatistics(row.fixture.id, now), []);
  assert.deepEqual(demoFixturePlayers(row.fixture.id, now), []);
  assert.deepEqual(demoFixtureLineups(row.fixture.id, now), []);
  assert.equal(demoFixtureById(900_334_000, now), null);
  assert.equal(demoFixtureById(900_000_999, now), null);
  let awarded = [];
  for (let day = 0; day < DEMO_DAYS && awarded.length === 0; day += 1) {
    awarded = demoFixturesForDate(demoDateAt(day), finishedAt).filter((r) => ["AWD", "WO"].includes(r.fixture.status.short));
  }
  assert.ok(awarded.length > 0);
  for (const row of awarded) {
    assert.deepEqual(row.fixture.periods, { first: null, second: null });
    assert.deepEqual(row.score.halftime, { home: null, away: null });
    assert.deepEqual(row.goals, { home: 3, away: 0 });
  }
});

test("official list/detail shape and envelope do not leak internal generator metadata", () => {
  const list = request("/fixtures", { date: "2026-10-27", timezone: "Africa/Kampala" });
  assert.deepEqual(Object.keys(list).sort(), ["errors", "get", "paging", "parameters", "response", "results"]);
  assert.equal(list.get, "fixtures"); assert.deepEqual(list.parameters, { date: "2026-10-27", timezone: "Africa/Kampala" });
  assert.equal(list.results, 560); assert.deepEqual(list.errors, []); assert.deepEqual(list.paging, { current: 1, total: 1 });
  const row = list.response[0];
  assert.deepEqual(Object.keys(row).sort(), ["fixture", "goals", "league", "score", "teams"]);
  assert.deepEqual(Object.keys(row.teams.home).sort(), ["id", "logo", "name", "winner"]);
  assert.equal("index" in row.league, false); assert.equal("leagueId" in row.teams.home, false);
  const detail = request("fixtures", { id: String(row.fixture.id) });
  assert.equal(detail.results, 1);
  for (const field of ["events", "lineups", "statistics", "players"]) assert.ok(Array.isArray(detail.response[0][field]));
  const stats = request("fixtures/statistics", { fixture: String(row.fixture.id) }, finishedAt);
  for (const team of stats.response) for (const statistic of team.statistics) assert.deepEqual(Object.keys(statistic).sort(), ["type", "value"]);
  const halfStats = request("fixtures/statistics", { fixture: String(row.fixture.id), half: "true" }, finishedAt);
  assert.deepEqual(halfStats.errors, []);
  for (const team of halfStats.response) {
    assert.ok(Array.isArray(team.statistics_1h)); assert.ok(Array.isArray(team.statistics_2h));
  }
  assert.deepEqual(request("fixtures", { ids: `${row.fixture.id}-${list.response[1].fixture.id}` }).response.map((f) => f.fixture.id).sort(),
    [row.fixture.id, list.response[1].fixture.id].sort());
});

test("existing API-Football normalizers accept all fixture and detail payload families", () => {
  const rows = demoFixturesForDate("2026-10-27", finishedAt);
  for (const fixture of rows) assert.equal(normalizeFixture(fixture, context("/fixtures")).valid, true);
  const row = rows.find((r) => r.fixture.status.short === "FT" && r.goals.home + r.goals.away > 0);
  assert.ok(row); const id = row.fixture.id;
  for (const data of request("teams", { league: String(row.league.id) }).response) assert.equal(normalizeTeam(data, context("/teams")).valid, true);
  for (const data of request("leagues").response) assert.equal(normalizeCompetition(data, context("/leagues")).valid, true);
  for (const data of demoFixtureStatistics(id, finishedAt)) assert.equal(normalizeStatistics(data, context("/fixtures/statistics")).valid, true);
  for (const data of demoFixtureEvents(id, finishedAt)) assert.equal(normalizeEvent(data, context("/fixtures/events")).valid, true);
  for (const data of demoFixtureLineups(id, finishedAt)) assert.equal(normalizeAvailability(data, "lineups", context("/fixtures/lineups")).valid, true);
  for (const data of request("injuries", { fixture: String(id) }, finishedAt).response) assert.equal(normalizeAvailability(data, "injuries", context("/injuries")).valid, true);
  for (const data of request("players", { team: String(row.teams.home.id), season: "2026" }).response) assert.equal(normalizePlayerStatistics(data, context("/players")).valid, true);
  assert.equal(normalizeFallbackPrediction(request("predictions", { fixture: String(id) }).response[0], context("/predictions")).valid, true);
  assert.equal(normalizeOdds(demoFixtureOdds(id, now), context("/odds")).valid, true);
  for (const endpoint of ["odds/bookmakers", "odds/bets"]) for (const data of request(endpoint).response) assert.equal(normalizeOddsCatalogEntry(data, context(`/${endpoint}`)).valid, true);
});

test("goal timelines, team scores, cards and player goals stay coherent", () => {
  const rows = demoFixturesForDate("2026-10-27", finishedAt).filter((r) => ["FT", "AET", "PEN"].includes(r.fixture.status.short));
  for (const row of rows) {
    const events = demoFixtureEvents(row.fixture.id, finishedAt), stats = demoFixtureStatistics(row.fixture.id, finishedAt);
    assert.deepEqual(events.map((event) => event.time.elapsed), events.map((event) => event.time.elapsed).sort((a, b) => a - b));
    for (const side of ["home", "away"]) {
      const teamId = row.teams[side].id, goals = events.filter((event) => event.team.id === teamId && event.type === "Goal");
      assert.equal(goals.length, row.goals[side]);
      assert.equal(goals.filter((goal) => goal.time.elapsed <= 45).length, row.score.halftime[side]);
      assert.equal(goals.filter((goal) => goal.time.elapsed <= 90).length, row.score.fulltime[side]);
      const statistics = Object.fromEntries(stats.find((r) => r.team.id === teamId).statistics.map((s) => [s.type, s.value]));
      assert.equal(statistics["Total Shots"], statistics["Shots on Goal"] + statistics["Shots off Goal"] + statistics["Blocked Shots"]);
      assert.equal(statistics["Total Shots"], statistics["Shots insidebox"] + statistics["Shots outsidebox"]);
      assert.equal(statistics["Yellow Cards"], events.filter((event) => event.team.id === teamId && event.detail === "Yellow Card").length);
    }
    assert.equal(stats.map((r) => Number(r.statistics.find((s) => s.type === "Ball Possession").value.replace("%", ""))).reduce((a, b) => a + b, 0), 100);
  }
});

test("match clock supplies live phases and confirmed formations at documented times", () => {
  const row = demoFixturesForDate("2026-11-01", finishedAt).find((r) => r.fixture.status.short === "FT");
  const id = row.fixture.id, kickoff = demoFixtureKickoff(id);
  for (const [minutes, status] of [[-1, "NS"], [10, "1H"], [50, "HT"], [80, "2H"], [120, "FT"]]) {
    assert.equal(demoFixtureById(id, kickoff + minutes * 60_000).fixture.status.short, status);
  }
  assert.equal(demoFixtureLineups(id, kickoff - 41 * 60_000).length, 0);
  const lineups = demoFixtureLineups(id, kickoff - 39 * 60_000);
  assert.equal(lineups.length, 2);
  for (const lineup of lineups) {
    assert.equal(lineup.startXI.length, 11); assert.equal(lineup.substitutes.length, 9);
    assert.equal(new Set(lineup.startXI.map((p) => p.player.id)).size, 11);
    assert.equal(new Set(lineup.startXI.map((p) => p.player.grid)).size, 11);
  }
  const live = request("fixtures", { live: "all" }, kickoff + 10 * 60_000);
  assert.ok(live.response.some((r) => r.fixture.id === id));
  assert.ok(live.response.every((r) => Array.isArray(r.events)));
});

test("team form, standings, goals and points derive from the generated historical fixtures", () => {
  const row = demoFixturesForDate("2026-10-27", finishedAt).find((r) => r.fixture.status.short === "FT");
  const teamId = row.teams.home.id, history = request("fixtures", { team: String(teamId), league: String(row.league.id), season: "2026" }, now).response
    .filter((r) => ["FT", "AET", "PEN", "AWD", "WO"].includes(r.fixture.status.short));
  const stats = demoTeamStatistics(teamId, now);
  assert.equal(demoTeamForm(teamId, now), stats.form.slice(-5), "short form uses the same recent fixture outcomes");
  assert.equal(stats.fixtures.played.total, history.length); assert.equal(stats.form.length, history.length);
  assert.equal(stats.fixtures.wins.total + stats.fixtures.draws.total + stats.fixtures.loses.total, history.length);
  const goalsFor = history.reduce((sum, fixture) => sum + fixture.goals[fixture.teams.home.id === teamId ? "home" : "away"], 0);
  assert.equal(stats.goals.for.total.total, goalsFor);
  const league = request("standings", { league: String(row.league.id), season: "2026" }).response[0].league;
  const table = league.standings.flat().find((r) => r.team.id === teamId);
  assert.equal(table.all.played, history.length); assert.equal(table.all.goals.for, goalsFor);
  assert.equal(table.points, stats.fixtures.wins.total * 3 + stats.fixtures.draws.total);
});

test("live-all includes prior-day kickoffs still playing after local midnight", () => {
  const midnight = Date.parse("2026-10-28T00:30:00+03:00");
  const previous = demoFixturesForDate("2026-10-27", midnight).find((row) => ["1H", "HT", "2H", "ET", "BT", "P"].includes(row.fixture.status.short));
  assert.ok(previous);
  const live = request("fixtures", { live: "all", timezone: "Africa/Kampala" }, midnight).response;
  assert.ok(live.some((row) => row.fixture.id === previous.fixture.id), "live-all must retain a playing fixture from the previous date");
  const explicit = request("fixtures", { live: "all", date: "2026-10-28", timezone: "Africa/Kampala" }, midnight).response;
  assert.ok(explicit.every((row) => row.fixture.date.startsWith("2026-10-28T")), "an explicit date filter still applies");
});

test("odds preserve official bookmaker/bet/value shape, decimal strings and pagination", () => {
  const first = request("odds", { date: "2026-11-30", timezone: "Africa/Kampala", bookmaker: "8", page: "1" });
  const second = request("odds", { date: "2026-11-30", timezone: "Africa/Kampala", bookmaker: "8", page: "2" });
  assert.equal(first.results, 10); assert.deepEqual(first.paging, { current: 1, total: 56 });
  assert.equal(second.paging.current, 2); assert.equal(new Set([...first.response, ...second.response].map((r) => r.fixture.id)).size, 20);
  for (const row of first.response) {
    assert.equal(row.bookmakers.length, 1); assert.equal(row.bookmakers[0].id, 8);
    for (const bet of row.bookmakers[0].bets) for (const value of bet.values) {
      assert.match(value.odd, /^\d+\.\d{2}$/u); assert.ok(Number(value.odd) > 1); assert.equal(typeof value.value, "string");
    }
    const p = demoFixtureProbabilities(row.fixture.id); assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-10);
    assert.ok(p.over(0.5) > p.over(2.5)); assert.ok(p.over(2.5) > p.over(4.5));
  }
  const filtered = request("odds", { fixture: String(first.response[0].fixture.id), bookmaker: "8", bet: "5" });
  assert.equal(filtered.response[0].bookmakers[0].bets.length, 1); assert.equal(filtered.response[0].bookmakers[0].bets[0].id, 5);
  assert.equal(request("players", { team: "800000", season: "2026", page: "1" }).results, 20);
  assert.equal(request("players", { team: "800000", season: "2026", page: "2" }).results, 4);
});

test("local fetch honors URL/query protocol without invoking a live service", async () => {
  const fetcher = createDemoApiFootballFetch({ now: () => now });
  const response = await fetcher("https://v3.football.api-sports.io/fixtures?date=2026-11-30&timezone=Africa%2FKampala");
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/json");
  const body = await response.json(); assert.equal(body.results, 560); assert.equal(body.get, "fixtures");
  assert.equal((await fetcher("https://v3.football.api-sports.io/fixtures", { method: "POST" })).status, 405);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetcher("https://v3.football.api-sports.io/fixtures", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(request("fixtures", { timezone: "Invalid/Timezone" }).results, 0);
  assert.ok(request("fixtures/players").errors.fixture); assert.ok(request("unknown").errors.endpoint);
});

test("timezone dates, explicit unknown IDs, empty parameters and season selectors follow provider semantics", () => {
  for (const timezone of ["UTC", "Africa/Kampala", "America/New_York", "Asia/Tokyo"]) {
    const rows = request("fixtures", { date: "2026-10-28", timezone }).response;
    assert.ok(rows.length >= 500);
    assert.ok(rows.every((r) => r.fixture.date.startsWith("2026-10-28T")));
    assert.ok(rows.every((r) => r.fixture.timezone === timezone && Date.parse(r.fixture.date) === r.fixture.timestamp * 1_000));
    const odds = request("odds", { date: "2026-10-28", timezone, bookmaker: "8" }).response;
    assert.ok(odds.every((r) => r.fixture.timezone === timezone && r.fixture.date.startsWith("2026-10-28T")));
  }
  for (const endpoint of ["odds", "injuries", "fixtures/events", "fixtures/lineups", "fixtures/statistics", "fixtures/players", "predictions"]) {
    assert.equal(request(endpoint, { fixture: "1" }).results, 0, endpoint);
  }
  for (const endpoint of ["teams", "players", "standings", "teams/statistics", "fixtures", "odds", "injuries"]) {
    assert.equal(request(endpoint, { team: "800000", league: "700001", season: "2025" }).results, 0, endpoint);
  }
  const status = request("status");
  assert.deepEqual(status.parameters, []); assert.equal("paging" in status, false);
  assert.equal(status.results, 1); assert.equal(typeof status.response.account.firstname, "string");
});

test("head-to-head last filter selects the last meeting and leaderboards rank actual event aggregates", () => {
  const fixture = demoFixturesForDate("2026-10-27", finishedAt).find((r) => r.fixture.status.short === "FT");
  const h2h = `${fixture.teams.home.id}-${fixture.teams.away.id}`;
  const meetings = request("fixtures/headtohead", { h2h, status: "FT" }, now).response;
  const last = request("fixtures/headtohead", { h2h, status: "FT", last: "1" }, now).response;
  assert.ok(meetings.length > 0); assert.equal(last[0].fixture.id, meetings.at(-1).fixture.id);
  for (const [endpoint, metric] of [["players/topscorers", "total"], ["players/topassists", "assists"]]) {
    const leaders = request(endpoint, { league: "700001", season: "2026" }).response;
    assert.equal(leaders.length, 20);
    const numbers = leaders.map((player) => player.statistics[0].goals[metric]);
    assert.deepEqual(numbers, [...numbers].sort((a, b) => b - a)); assert.ok(numbers[0] > 0);
  }
  const teamId = fixture.teams.home.id;
  const history = request("fixtures", { team: String(teamId), league: "700001", season: "2026", status: "FT-AET-PEN" }).response;
  const player = request("players", { team: String(teamId), season: "2026" }).response.find((r) => r.statistics[0].games.position === "Attacker");
  const goalEvents = history.flatMap((row) => demoFixtureEvents(row.fixture.id, now))
    .filter((event) => event.player.id === player.player.id && event.type === "Goal" && event.detail !== "Own Goal");
  assert.equal(player.statistics[0].goals.total, goalEvents.length);
});

test("team statistics and prediction context retain their distinct documented nested schemas", () => {
  // API-Football v3.9.3 /teams/statistics: under_over uses scalar counts,
  // whereas /predictions teams.<side>.league.goals contains only total/average.
  const response = request("teams/statistics", { team: "800000", league: "700001", season: "2026" });
  assert.equal(response.results, 11);
  const stats = response.response;
  for (const key of ["for", "against"]) {
    for (const [line, counts] of Object.entries(stats.goals[key].under_over)) {
      assert.deepEqual(Object.keys(counts).sort(), ["over", "under"]);
      assert.equal(Number.isSafeInteger(counts.over), true);
      assert.equal(Number.isSafeInteger(counts.under), true);
      assert.equal(counts.over + counts.under, stats.fixtures.played.total);
      assert.ok(Number(line) > 0);
    }
  }
  const row = demoFixturesForDate("2026-10-27", finishedAt)[0];
  const prediction = request("predictions", { fixture: String(row.fixture.id) }).response[0];
  for (const side of ["home", "away"]) for (const key of ["for", "against"]) {
    assert.deepEqual(Object.keys(prediction.teams[side].league.goals[key]).sort(), ["average", "total"]);
    for (const number of Object.values(prediction.teams[side].league.goals[key].total)) assert.equal(typeof number, "number");
    for (const average of Object.values(prediction.teams[side].league.goals[key].average)) assert.equal(typeof average, "string");
  }
});

test("team-statistics cutoffs and league filters do not expose future or unrelated results", () => {
  const params = { team: "800000", league: "700001", season: "2026" };
  const present = request("teams/statistics", params).response;
  assert.deepEqual(request("teams/statistics", { ...params, date: "2026-11-30" }).response, present);
  const past = request("teams/statistics", { ...params, date: "2026-02-01" }).response;
  assert.ok(past.fixtures.played.total < present.fixtures.played.total);
  assert.equal(request("teams/statistics", { ...params, league: "700002" }).results, 0);
  for (const date of ["2026-02-30", "not-a-date"]) assert.ok(request("teams/statistics", { ...params, date }).errors.date);
  const table = request("standings", params).response[0].league.standings.flat();
  assert.equal(table.length, 1); assert.equal(table[0].team.id, 800000);
  assert.equal(request("standings", { ...params, league: "700002" }).results, 0);
});

test("round catalog and current round match both league and cup fixture filters", () => {
  for (const league of [demoFootballCatalog.leagues.find((row) => row.type === "League"), demoFootballCatalog.leagues.find((row) => row.type === "Cup")]) {
    const params = { league: String(league.id), season: "2026" };
    const catalog = request("fixtures/rounds", params).response;
    const current = request("fixtures/rounds", { ...params, current: "true" }).response;
    assert.equal(current.length, 1); assert.ok(catalog.includes(current[0]));
    for (const date of ["2026-01-01", "2026-06-16", "2026-10-28", "2026-11-30"]) {
      const fixtures = request("fixtures", { ...params, date, timezone: "Africa/Kampala" }).response;
      assert.ok(fixtures.length > 0);
      assert.ok(fixtures.every((row) => catalog.includes(row.league.round)));
      if (date === "2026-10-28") assert.ok(fixtures.every((row) => row.league.round === current[0]));
    }
    assert.ok(request("fixtures", { ...params, round: current[0] }).results > 0);
  }
});
