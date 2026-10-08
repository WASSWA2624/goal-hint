import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFixture, normalizeTeam, normalizeCompetition, normalizeStatistics,
  normalizePlayerStatistics, normalizeAvailability, normalizeFallbackPrediction } from "../src/server/football/api-football-normalize.ts";
import { parseUtcInstant } from "../src/domain/calendar.ts";

// Synthetic direct-v3 fixtures. These are contract examples, never live/account evidence.
const retrievedAt = parseUtcInstant("2026-10-08T10:00:00Z");
const context = (endpoint = "/fixtures", overrides = {}) => ({ retrievedAt, endpoint, ...overrides });
const providerTeam = (id = 1) => ({ id, name: `Synthetic team ${id}`, code: `T${id}`, country: "Synthetic",
  national: false, logo: `https://media.api-sports.io/football/teams/${id}.png` });
function fixture(overrides = {}) {
  return {
    fixture: { id: 101, date: "2026-10-08T21:30:00+03:00", timezone: "Africa/Kampala",
      timestamp: 1791484200, status: { short: "FT", elapsed: 90 } },
    league: { id: 10, name: "Synthetic league", country: "Synthetic", season: 2026, round: "Regular Season - 1" },
    teams: { home: providerTeam(1), away: providerTeam(2) }, goals: { home: 2, away: 1 },
    score: { fulltime: { home: 2, away: 1 }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
    ...overrides,
  };
}
function data(result) {
  assert.equal(result.valid, true);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.data));
  assert.ok(Object.isFrozen(result.missingCoverage));
  return result.data;
}
const invalid = { valid: false, reason: "schema-error" };

test("synthetic fixture identities, Kampala kickoff, and independent source times normalize", () => {
  const result = normalizeFixture(fixture(), context());
  const normalized = data(result);
  assert.equal(normalized.id, 101);
  assert.equal(normalized.homeTeam.id, 1);
  assert.equal(normalized.awayTeam.id, 2);
  assert.equal(normalized.competition.season, 2026);
  assert.equal(normalized.kickoff, parseUtcInstant("2026-10-08T18:30:00Z"));
  assert.equal(normalized.source.retrievedAt, retrievedAt);
  assert.equal(normalized.source.providerUpdatedAt, null);
  assert.ok(result.missingCoverage.includes("provider-update-time"));
  assert.equal(normalized.regulationScore.verified, false);
  assert.ok(result.missingCoverage.includes("regulation-score-verification"));
});

test("fixture status maps every direct-v3 code without inferring a vanished live result", () => {
  const expected = {
    NS: "scheduled", TBD: "scheduled", "1H": "live", HT: "live", "2H": "live", ET: "live", BT: "live",
    P: "live", INT: "live", SUSP: "live", LIVE: "live", FT: "finished-regulation", AET: "finished-extra-time",
    PEN: "finished-penalties", PST: "postponed", CANC: "canceled", ABD: "abandoned", AWD: "awarded", WO: "awarded",
  };
  for (const [short, status] of Object.entries(expected)) {
    const raw = fixture();
    raw.fixture.status.short = short;
    const normalized = data(normalizeFixture(raw, context()));
    assert.equal(normalized.status, status, short);
    if (!["FT", "AET", "PEN"].includes(short)) assert.equal(normalized.regulationScore, null);
  }
  const raw = fixture();
  delete raw.fixture.status;
  const unknown = normalizeFixture(raw, context());
  assert.equal(data(unknown).status, "unknown");
  assert.equal(unknown.data.regulationScore, null);
  raw.fixture.status = { short: "NEW_STATUS" };
  assert.equal(data(normalizeFixture(raw, context())).status, "unknown");
});

test("regulation verification binds fixture, provider status and the separate fulltime candidate", () => {
  const raw = fixture();
  raw.fixture.status.short = "AET";
  raw.goals = { home: 4, away: 2 };
  raw.score.extratime = { home: 4, away: 2 };
  let candidate;
  const normalized = data(normalizeFixture(raw, context("/fixtures", { verifyRegulationScore: (value) => {
    candidate = value;
    return value.fixtureId === 101 && value.providerStatus === "AET" && value.home === 2 && value.away === 1;
  } })));
  assert.ok(Object.isFrozen(candidate));
  assert.equal(candidate.sourceField, "score.fulltime");
  assert.equal(candidate.period, "regulation-including-stoppage-time");
  assert.equal(normalized.regulationScore.verified, true);
  assert.equal(normalized.regulationScore.home, 2);
  assert.deepEqual(normalized.extraTimeScore, { home: 4, away: 2 });
});

test("extra-time and shootout aggregate totals cannot fill missing regulation scores", () => {
  for (const short of ["ET", "P", "AET", "PEN", "LIVE"]) {
    const raw = fixture();
    raw.fixture.status.short = short;
    raw.goals = { home: 5, away: 4 };
    raw.score = { fulltime: null, extratime: { home: 3, away: 3 }, penalty: { home: 5, away: 4 } };
    let verified = false;
    const result = normalizeFixture(raw, context("/fixtures", { verifyRegulationScore: () => { verified = true; return true; } }));
    assert.equal(data(result).regulationScore, null);
    assert.equal(verified, false);
  }
  const inconsistent = fixture({ goals: { home: 10, away: 1 } });
  assert.deepEqual(normalizeFixture(inconsistent, context("/fixtures", { verifyRegulationScore: () => true })), invalid);
  assert.equal(data(normalizeFixture(fixture(), context("/fixtures", { verifyRegulationScore: () => { throw Error("no evidence"); } }))).regulationScore.verified, false);
});

test("malformed or conflicting identities, scores and kickoff values fail without coercion", () => {
  for (const mutate of [
    (raw) => { raw.fixture.id = "101"; },
    (raw) => { raw.teams.home.id = 0; },
    (raw) => { raw.teams.away.id = 1; },
    (raw) => { raw.score.fulltime.home = -1; },
    (raw) => { raw.score.fulltime.away = 1.5; },
    (raw) => { raw.fixture.timestamp += 1; },
    (raw) => { raw.fixture.timezone = "UTC"; },
    (raw) => { raw.fixture.timezone = "Not/AZone"; },
    (raw) => { raw.fixture.date = "2026-02-30T21:30:00+03:00"; },
    (raw) => { raw.fixture.date = "2026-10-08T21:30:00"; },
    (raw) => { raw.fixture.date = "2026-10-08T24:30:00+03:00"; },
    (raw) => { raw.fixture.date = "2026-10-08T21:30:00+14:30"; },
  ]) {
    const raw = fixture();
    mutate(raw);
    assert.deepEqual(normalizeFixture(raw, context()), invalid);
  }
  assert.deepEqual(normalizeFixture(fixture(), context("/fixtures?key=secret")), invalid);
  assert.deepEqual(normalizeFixture(fixture(), context("/fixtures", { retrievedAt: NaN })), invalid);
});

test("missing kickoff, status, names and update metadata remain explicitly unknown", () => {
  const raw = fixture();
  raw.fixture.date = null;
  raw.fixture.timestamp = null;
  raw.fixture.status = null;
  raw.teams.home.name = null;
  raw.league.name = "";
  raw.updated = "2026-10-08T09:00:00Z"; // An undocumented field is not an update-time contract.
  const result = normalizeFixture(raw, context());
  const normalized = data(result);
  assert.equal(normalized.kickoff, null);
  assert.equal(normalized.status, "unknown");
  assert.equal(normalized.homeTeam.name, null);
  assert.equal(normalized.competition.name, null);
  assert.equal(normalized.source.providerUpdatedAt, null);
  assert.ok(result.missingCoverage.includes("kickoff-date"));
  assert.ok(result.missingCoverage.includes("home-team-name"));
});

test("logo URLs need exact rights approval and remain HTTPS credential-free strings", () => {
  const raw = { team: providerTeam() };
  const blocked = normalizeTeam(raw, context("/teams"));
  assert.deepEqual(data(blocked).logo, { url: null, rights: "review-required" });
  assert.ok(blocked.missingCoverage.includes("team-logo-rights-review"));
  let observed;
  const approved = normalizeTeam(raw, context("/teams", { verifyLogo: (url) => { observed = url; return true; } }));
  assert.equal(data(approved).logo.url, raw.team.logo);
  assert.equal(observed, raw.team.logo);
  for (const logo of ["http://media.api-sports.io/logo.png", "https://user:secret@example.com/logo.png",
    "https://example.com/logo.png?api_key=secret", "https://example.com/logo.png#secret", "data:image/png;base64,AA==",
    " https://example.com/logo.png"]) {
    raw.team.logo = logo;
    assert.equal(data(normalizeTeam(raw, context("/teams", { verifyLogo: () => true }))).logo.url, null);
  }
  raw.team.logo = null;
  assert.equal(data(normalizeTeam(raw, context("/teams"))).logo.rights, "unavailable");
});

test("team references preserve stable identities and nullable metadata", () => {
  const result = normalizeTeam({ id: 77 }, context("/teams"));
  assert.equal(data(result).id, 77);
  assert.equal(result.data.name, null);
  assert.equal(result.data.national, null);
  assert.ok(result.missingCoverage.includes("team-name"));
  assert.ok(result.missingCoverage.includes("team-country"));
  assert.ok(result.missingCoverage.includes("team-national"));
  assert.deepEqual(normalizeTeam({ id: Number.MAX_SAFE_INTEGER + 1 }, context("/teams")), invalid);
  assert.deepEqual(normalizeTeam({ id: 77, team: { id: "malformed" } }, context("/teams")), invalid);
});

test("competition coverage distinguishes false from unknown for every season", () => {
  const result = normalizeCompetition({ league: { id: 10, name: "Synthetic league", type: "League" },
    country: { name: "Synthetic" }, seasons: [{ year: 2026, current: true, coverage: {
      fixtures: { events: true, lineups: false, statistics_fixtures: true }, injuries: false, predictions: true,
    } }] }, context("/leagues"));
  const normalized = data(result);
  assert.equal(normalized.country, "Synthetic");
  assert.equal(normalized.seasons[0].coverage["fixtures.lineups"], false);
  assert.equal(normalized.seasons[0].coverage.injuries, false);
  assert.equal(normalized.seasons[0].coverage["fixtures.statistics_players"], null);
  assert.ok(result.missingCoverage.includes("competition-2026-fixtures.statistics_players-coverage"));
  assert.ok(Object.isFrozen(normalized.seasons[0].coverage));
  assert.deepEqual(normalizeCompetition({ league: { id: 10 }, seasons: [{ year: 2026 }, { year: 2026 }] }, context("/leagues")), invalid);
  assert.deepEqual(normalizeCompetition({ league: { id: 10 }, seasons: [{ year: "2026" }] }, context("/leagues")), invalid);
});

test("supported statistics retain finite count and percentage units; xG stays unverified", () => {
  const result = normalizeStatistics({ team: providerTeam(), statistics: [
    { type: "Shots on Goal", value: 5 }, { type: "Ball Possession", value: "57.5%" },
    { type: "Passes %", value: null }, { type: "expected_goals", value: "1.47" },
  ] }, context("/fixtures/statistics"));
  const normalized = data(result);
  assert.deepEqual(normalized.statistics[0], { providerType: "Shots on Goal", metric: "shots-on-goal", value: 5, unit: "count", supported: true });
  assert.equal(normalized.statistics[1].value, 57.5);
  assert.equal(normalized.statistics[1].unit, "percent");
  assert.equal(normalized.statistics[2].value, null);
  assert.equal(normalized.statistics[3].supported, false);
  assert.equal(normalized.statistics[3].metric, null);
  assert.equal(normalized.statistics[3].value, "1.47");
  assert.ok(result.missingCoverage.includes("unsupported-statistic:expected_goals"));
});

test("malformed count/percentage values and duplicate statistics are schema failures", () => {
  for (const statistic of [{ type: "Shots on Goal", value: "5" }, { type: "Shots on Goal", value: -1 },
    { type: "Shots on Goal", value: Infinity }, { type: "Shots on Goal", value: 5.2 },
    { type: "Ball Possession", value: "101%" }, { type: "Ball Possession", value: 57 },
    { type: "Ball Possession", value: "57" }]) {
    assert.deepEqual(normalizeStatistics({ team: providerTeam(), statistics: [statistic] }, context("/fixtures/statistics")), invalid);
  }
  assert.deepEqual(normalizeStatistics({ team: providerTeam(), statistics: [
    { type: "Shots on Goal", value: 5 }, { type: "Shots on Goal", value: 6 },
  ] }, context("/fixtures/statistics")), invalid);
  const empty = normalizeStatistics({ team: providerTeam(), statistics: [] }, context("/fixtures/statistics"));
  assert.ok(empty.missingCoverage.includes("fixture-statistics"));
});

test("synthetic player page rows preserve identities and team-season aggregates separately", () => {
  const result = normalizePlayerStatistics({
    player: { id: 777, name: "Synthetic player", firstname: "Synthetic", lastname: "Player", age: 25,
      nationality: "Synthetic", photo: "https://media.api-sports.io/football/players/777.png" },
    statistics: [{ team: providerTeam(1), league: { id: 10, name: "Synthetic league", season: 2026 },
      games: { appearences: 4, minutes: 301 }, goals: { total: 2, assists: 0 } },
    { team: providerTeam(3), league: { id: 20, name: "Synthetic cup", season: 2026 },
      games: { appearences: 1, minutes: 37 }, goals: { total: 0, assists: 1 } }],
  }, context("/players"));
  const normalized = data(result);
  assert.equal(normalized.player.id, 777);
  assert.equal(normalized.player.nationality, "Synthetic");
  assert.equal(normalized.player.photo.url, null);
  assert.ok(result.missingCoverage.includes("player-photo-rights-review"));
  assert.equal(normalized.statistics.length, 2);
  assert.equal(normalized.statistics[0].team.id, 1);
  assert.equal(normalized.statistics[0].competition.season, 2026);
  assert.deepEqual(normalized.statistics[0].games, { appearances: 4, minutes: 301 });
  assert.deepEqual(normalized.statistics[0].goals, { total: 2, assists: 0 });
  assert.equal(normalized.statistics[1].competition.id, 20);
  assert.deepEqual(normalized.statistics[1].goals, { total: 0, assists: 1 });
  assert.equal(normalized.source.retrievedAt, retrievedAt);
  assert.equal(normalized.source.providerUpdatedAt, null);
  assert.equal(Object.hasOwn(normalized, "regulationScore"), false);
});

test("player metadata and missing aggregate values remain null with coverage metadata", () => {
  const result = normalizePlayerStatistics({ player: { id: 777 }, statistics: [{ team: { id: 1 }, league: { id: 10 },
    games: null, goals: { total: null, assists: null } }] }, context("/players"));
  const normalized = data(result);
  assert.equal(normalized.player.name, null);
  assert.equal(normalized.player.nationality, null);
  assert.equal(normalized.player.age, null);
  assert.deepEqual(normalized.statistics[0].games, { appearances: null, minutes: null });
  assert.deepEqual(normalized.statistics[0].goals, { total: null, assists: null });
  assert.ok(result.missingCoverage.includes("player-statistics-1-10-unknown-season-minutes"));
  assert.ok(result.missingCoverage.includes("player-statistics-1-10-unknown-season-goals"));
  const empty = normalizePlayerStatistics({ player: { id: 777 }, statistics: [] }, context("/players"));
  assert.ok(empty.missingCoverage.includes("player-statistics"));
});

test("malformed player identities and aggregate counts reject page rows without coercion", () => {
  const row = () => ({ player: { id: 777 }, statistics: [{ team: { id: 1 }, league: { id: 10, season: 2026 },
    games: { appearences: 4, minutes: 301 }, goals: { total: 2, assists: 0 } }] });
  for (const mutate of [
    (raw) => { raw.player.id = "777"; }, (raw) => { raw.player.id = 0; },
    (raw) => { raw.statistics[0].team.id = -1; }, (raw) => { raw.statistics[0].league.id = null; },
    (raw) => { raw.statistics[0].games.minutes = "301"; }, (raw) => { raw.statistics[0].games.appearences = 4.5; },
    (raw) => { raw.statistics[0].goals.total = -1; }, (raw) => { raw.statistics[0].goals.assists = Infinity; },
  ]) {
    const raw = row();
    mutate(raw);
    assert.deepEqual(normalizePlayerStatistics(raw, context("/players")), invalid);
  }
});

test("partial lineups and missing injury fields never imply healthy or available players", () => {
  const lineup = normalizeAvailability({ team: providerTeam(), formation: null, startXI: [], substitutes: null }, "lineups", context("/fixtures/lineups"));
  assert.equal(data(lineup).fitnessConclusion, "unknown");
  assert.ok(lineup.missingCoverage.includes("starting-lineup"));
  assert.ok(lineup.missingCoverage.includes("substitutes"));
  const injury = normalizeAvailability({ team: providerTeam(), fixture: { id: 101 }, player: { id: 777, name: null, type: null, reason: null } }, "injuries", context("/injuries"));
  assert.equal(data(injury).reportedInjury.playerId, 777);
  assert.equal(injury.data.reportedInjury.type, null);
  assert.equal(injury.data.fitnessConclusion, "unknown");
  assert.ok(injury.missingCoverage.includes("injury-type"));
  assert.ok(injury.missingCoverage.includes("injury-reason"));
});

test("lineups preserve observed player identities and reject duplicate starting/substitute IDs", () => {
  const raw = { team: providerTeam(), formation: "4-4-2", startXI: [{ player: { id: 77, name: "Synthetic player", number: 7, pos: "M", grid: "3:1" } }], substitutes: [] };
  const normalized = data(normalizeAvailability(raw, "lineups", context("/fixtures/lineups")));
  assert.deepEqual(normalized.startingPlayers[0], { id: 77, name: "Synthetic player", number: 7, position: "M", grid: "3:1" });
  raw.substitutes = raw.startXI;
  assert.deepEqual(normalizeAvailability(raw, "lineups", context("/fixtures/lineups")), invalid);
  assert.deepEqual(normalizeAvailability({ player: { id: 77 }, team: providerTeam() }, "injuries", context("/injuries")), invalid);
});

test("fallback predictions preserve reported values separately from validated market probabilities", () => {
  const result = normalizeFallbackPrediction({ teams: { home: providerTeam(1), away: providerTeam(2) }, predictions: {
    winner: { id: 1, name: "Synthetic team 1", comment: "Win or draw" }, win_or_draw: true,
    under_over: "-3.5", goals: { home: "-2.5", away: "-1.5" }, advice: "Synthetic advice",
    percent: { home: "45%", draw: "45%", away: "10%" },
  } }, context("/predictions"));
  const normalized = data(result);
  assert.equal(normalized.purpose, "fallback-only");
  assert.deepEqual(normalized.reportedPercentages, { home: 45, draw: 45, away: 10 });
  assert.equal(normalized.underOver, "-3.5");
  assert.equal(normalized.goals.home, "-2.5");
  assert.equal(Object.hasOwn(normalized, "markets"), false);
  assert.equal(Object.hasOwn(normalized, "probabilities"), false);
  assert.ok(result.missingCoverage.includes("market-probabilities-unverified"));
});

test("prediction percentages reject malformed values but do not fabricate missing groups", () => {
  const raw = { teams: { home: providerTeam(1), away: providerTeam(2) }, predictions: {} };
  const result = normalizeFallbackPrediction(raw, context("/predictions"));
  assert.deepEqual(data(result).reportedPercentages, { home: null, draw: null, away: null });
  assert.ok(result.missingCoverage.includes("prediction-percentages"));
  for (const home of ["101%", "-1%", "45", "NaN%", "0.1234567%", 45]) {
    raw.predictions = { percent: { home, draw: "25%", away: "30%" } };
    assert.deepEqual(normalizeFallbackPrediction(raw, context("/predictions")), invalid);
  }
  raw.predictions = { winner: { id: 999 } };
  assert.deepEqual(normalizeFallbackPrediction(raw, context("/predictions")), invalid);
});
