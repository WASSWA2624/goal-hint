import assert from "node:assert/strict";
import test from "node:test";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { apiFootballFixtureRoundParameters, apiFootballLeaderboards } from "../src/server/football/api-football-contract.ts";
import { createFootballHistoryReference } from "../src/server/football/history-reference.ts";
import { readHistoryReferenceTargets } from "../src/server/football/history-reference-targets.ts";
import { createFootballHistorySource } from "../src/server/football/history-source.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { catalogBounds, catalogHash, catalogResponse, catalogTeam, CATALOG_NOW } from "./helpers/catalog-fixtures.mjs";

const league = { id: 39, season: 2025 };
const venue = { id: 117, name: "Synthetic Ground", capacity: 42_000 };
const injury = { player: { id: 79, type: "Missing Fixture", reason: "Synthetic injury" }, fixture: { id: 1234 },
  team: { id: 10 }, league };
const transfers = [{ date: "2025-07-01", type: "Loan", teams: { in: { id: 10 }, out: { id: 20 } } },
  { date: "2021-07-01", type: "Free", teams: { in: { id: 30 }, out: { id: 40 } } }];
const scenarios = [
  [{ endpoint: "teams", competitionId: 39, season: 2025 }, { league: "39", season: "2025" }, [{ team: catalogTeam(10), venue }]],
  [{ endpoint: "standings", competitionId: 39, season: 2025 }, { league: "39", season: "2025" },
    [{ league: { ...league, standings: [[{ rank: 1, team: { id: 10 }, points: 81 }], [{ rank: 1, team: { id: 20 }, points: 75 }]] } }]],
  [{ endpoint: "injuries", competitionId: 39, season: 2025 }, { league: "39", season: "2025" },
    [injury, { ...injury, fixture: { id: 1235 } }]],
  [{ endpoint: "venues", venueId: 117 }, { id: "117" }, [venue]],
  [{ endpoint: "transfers", teamId: 10 }, { team: "10" }, [{ player: { id: 79 }, transfers }]],
];
const countryRows = [{ name: "England", code: "GB", flag: "https://media.api-sports.io/flags/gb.svg" },
  { name: "World", code: null, flag: null }];
const teamStatisticsTarget = { endpoint: "teamStatistics", competitionId: 39, season: 2025, teamId: 10 };
const teamStatisticsParameters = { league: "39", season: "2025", team: "10" };
const teamStatistics = { league, team: { id: 10 }, form: "WL", fixtures: { played: { total: 2 } }, goals: {}, biggest: {},
  clean_sheet: {}, failed_to_score: {}, penalty: {}, lineups: [], cards: {} };

function teamStatisticsResponse(url, row = teamStatistics, options = {}) {
  return new Response(JSON.stringify({ get: "teams/statistics", parameters: Object.fromEntries(url.searchParams),
    errors: [], results: Object.keys(row).length, paging: { current: 1, total: 1 }, response: row, ...options }),
  { headers: { "content-type": "application/json" } });
}

function setup(respond) {
  const transport = [], reservations = [], pages = [];
  let currentTime = CATALOG_NOW;
  const clock = { now: () => currentTime };
  const authorize = () => undefined;
  const limiter = {
    async reserve(request) {
      reservations.push(request);
      return { status: "reserved", permit: { requestId: request.requestId, periodId: catalogHash("reference-day"),
        ownerToken: catalogHash(request.requestId), dispatchedAt: currentTime, launchBefore: currentTime + 10_000 } };
    },
    async claimLaunch() { return { status: "claimed", timeoutMs: 10_000 }; },
    async complete() { return { status: "recorded" }; },
  };
  const adapter = createApiFootballAdapter({ accountId: catalogHash("synthetic-reference-account"), clock,
    credential: { read: () => "synthetic-reference-key" }, gateway: createQuotaGateway({ limiter, authorize }), authorize,
    async fetcher(input) {
      const url = new URL(input);
      transport.push(url);
      currentTime += 100;
      return respond(url);
    } });
  const importer = createFootballHistoryReference({ reference: adapter.reference, now: clock.now,
    providerDayEndsAt: () => CATALOG_NOW + 60_000,
    async hasPage({ endpoint, parameters }) {
      return pages.some((page) => page.endpoint === endpoint && JSON.stringify(page.parameters) === JSON.stringify(parameters));
    },
    async savePage(page) { pages.push(page); },
  });
  return { adapter, importer, clock, pages, transport, reservations };
}

test("archives all five documented nonpaginated reference scopes with provider retrieval times and unchanged raw fields", async () => {
  const { importer, transport, pages, reservations } = setup((url) => {
    const [target, parameters, rows] = scenarios.find(([target]) => url.pathname === `/${target.endpoint}`);
    assert.equal(url.origin, "https://v3.football.api-sports.io");
    assert.equal(url.pathname, `/${target.endpoint}`);
    assert.deepEqual(Object.fromEntries(url.searchParams), parameters);
    return catalogResponse(url, rows);
  });
  const targets = scenarios.map(([target]) => target);
  const report = await importer.run({ targets, maxRequests: 5 });
  assert.deepEqual(report, { status: "complete", requested: 5, archived: 5, skipped: 0, deferred: 0, requests: 5, stopped: null });
  assert.deepEqual(pages, scenarios.map(([target, parameters, rows], index) => ({ endpoint: target.endpoint,
    parameters, rows, retrievedAt: CATALOG_NOW + (index + 1) * 100 })));
  assert.ok(reservations.every(({ priority }) => priority === "enrichment"));
  assert.equal(transport.length, 5);
  assert.equal((await importer.run({ targets: [...targets, targets[0]], maxRequests: 1 })).skipped, 5);
  assert.equal(transport.length, 5);
});

test("handles a complete empty response durably and starts with the newest unresolved season", async () => {
  const { importer, transport, pages } = setup((url) => catalogResponse(url, []));
  const targets = [2024, 2025, 2026].map((season) => ({ endpoint: "standings", competitionId: 39, season }));
  assert.deepEqual(await importer.run({ targets, maxRequests: 1 }),
    { status: "partial", requested: 1, archived: 1, skipped: 0, deferred: 0, requests: 1, stopped: "request-budget" });
  assert.equal((await importer.run({ targets, maxRequests: 1 })).skipped, 1);
  assert.deepEqual(transport.map((url) => url.searchParams.get("season")), ["2026", "2025"]);
  assert.deepEqual(pages.map(({ rows }) => rows), [[], []]);
});

test("leaves mismatched rows, truncated pagination, and omitted selector echoes unresolved", async () => {
  const invalid = new Map([
    ["/teams", (url) => new Response(JSON.stringify({ get: "teams", parameters: { league: url.searchParams.get("league") },
      errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] }), { headers: { "content-type": "application/json" } })],
    ["/standings", (url) => catalogResponse(url, [], { paging: { current: 1, total: 2 } })],
    ["/injuries", (url) => catalogResponse(url, [{ ...injury, league: { ...league, season: 2024 } }])],
    ["/venues", (url) => catalogResponse(url, [{ ...venue, id: 118 }])],
    ["/transfers", (url) => catalogResponse(url, [{ player: { id: 79 }, transfers: transfers.slice(1) }])],
  ]);
  const { importer, transport, pages } = setup((url) => invalid.get(url.pathname)(url));
  const targets = scenarios.map(([target]) => target);
  assert.deepEqual(await importer.run({ targets, maxRequests: 5 }),
    { status: "partial", requested: 5, archived: 0, skipped: 0, deferred: 5, requests: 5, stopped: null });
  assert.equal(transport.length, 5);
  assert.deepEqual(pages, []);
  assert.equal((await importer.run({ targets, maxRequests: 1 })).requested, 1);
  assert.equal(transport.length, 6);
});

test("validates targets before quota reservation and stops on interruption and provider throttling", async () => {
  const { importer, adapter, reservations, transport } = setup((url) => catalogResponse(url, [], { status: 429 }));
  const targets = scenarios.map(([target]) => target);
  const badTarget = { endpoint: "teams", competitionId: 39, season: 0 };
  assert.equal((await adapter.reference.page(badTarget, catalogBounds())).error.reason, "invalid-request");
  await assert.rejects(importer.run({ targets: [...targets, badTarget], maxRequests: 5 }), /Invalid historical reference target/);
  await assert.rejects(importer.run({ targets, maxRequests: 101 }), /request limit/);
  assert.equal((await importer.run({ targets, maxRequests: 5, signal: AbortSignal.abort() })).stopped, "interrupted");
  assert.equal(reservations.length, 0);
  assert.equal(transport.length, 0);
  const report = await importer.run({ targets, maxRequests: 5 });
  assert.equal(report.stopped, "rate-limited");
  assert.equal(report.requests, 1);
  assert.equal(transport.length, 1);
});

test("does not share the raw teams projection with an overlapping normalized teams request", async () => {
  const { adapter, transport } = setup((url) => catalogResponse(url, [{ team: catalogTeam(10), venue }]));
  const [target] = scenarios[0];
  const bounds = catalogBounds();
  const [normal, archived] = await Promise.all([
    adapter.evidence.teams({ competitionId: target.competitionId, season: target.season }, bounds),
    adapter.reference.page(target, bounds),
  ]);
  assert.equal(normal.status, "complete");
  assert.equal(normal.data[0].name, "Synthetic club 10");
  assert.equal(archived.status, "complete");
  assert.deepEqual(archived.data[0].raw.venue, venue);
  assert.equal(transport.length, 2);
});

test("does not dispatch after a provider day rollover while checking stored coverage", async () => {
  const { adapter, clock, transport } = setup((url) => catalogResponse(url, []));
  let providerDayEnd = CATALOG_NOW + 60_000;
  const importer = createFootballHistoryReference({ reference: adapter.reference, now: clock.now,
    providerDayEndsAt: () => providerDayEnd,
    async hasPage() { providerDayEnd += 86_400_000; return false; },
    async savePage() { assert.fail("unexpected archive write"); },
  });
  const report = await importer.run({ targets: scenarios.map(([target]) => target), maxRequests: 5 });
  assert.equal(report.stopped, "provider-day-ended");
  assert.equal(report.requests, 0);
  assert.deepEqual(transport, []);
});

test("archives the three documented global dictionaries and the team-statistics object within the shared request budget", async () => {
  const rows = new Map([["/countries", countryRows], ["/timezone", ["Africa/Kampala", "America/Argentina/Buenos_Aires", "UTC"]],
    ["/leagues/seasons", [2008, 2025]], ["/teams", scenarios[0][2]]]);
  const { importer, transport, pages, reservations } = setup((url) => url.pathname === "/teams/statistics"
    ? teamStatisticsResponse(url) : catalogResponse(url, rows.get(url.pathname)));
  const targets = [teamStatisticsTarget, { endpoint: "countries" }, { endpoint: "timezones" },
    { endpoint: "leagueSeasons" }, scenarios[0][0]];
  const first = await importer.run({ targets, maxRequests: 4 });
  assert.equal(first.stopped, "request-budget");
  assert.deepEqual(transport.map(({ pathname }) => pathname), ["/countries", "/timezone", "/leagues/seasons", "/teams"]);
  assert.ok(transport.slice(0, 3).every(({ search }) => search === ""));
  assert.deepEqual(pages.slice(0, 3).map(({ rows: archivedRows }) => archivedRows), [...rows.values()].slice(0, 3));
  const second = await importer.run({ targets, maxRequests: 1, hasMoreTargets: true });
  assert.equal(second.stopped, "request-budget");
  assert.equal(second.skipped, 4);
  assert.equal(second.archived, 1);
  assert.equal(reservations.length, 5);
  assert.deepEqual(Object.fromEntries(transport[4].searchParams), teamStatisticsParameters);
  assert.deepEqual(pages[4], { endpoint: "teamStatistics", parameters: teamStatisticsParameters,
    rows: [teamStatistics], retrievedAt: CATALOG_NOW + 500 });
});

test("new reference endpoints withhold unexpected selectors, invalid rows, and inconsistent object counts", async () => {
  const { importer, adapter, pages } = setup((url) => {
    if (url.pathname === "/teams/statistics") return teamStatisticsResponse(url, { ...teamStatistics, team: { id: 11 } });
    if (url.pathname === "/countries") return new Response(JSON.stringify({ get: "countries", parameters: { name: "england" },
      errors: [], results: countryRows.length, paging: { current: 1, total: 1 }, response: countryRows }),
    { headers: { "content-type": "application/json" } });
    return catalogResponse(url, url.pathname === "/timezone" ? ["Africa/Kampala\n"] : ["2025"]);
  });
  const targets = [{ endpoint: "countries" }, { endpoint: "timezones" }, { endpoint: "leagueSeasons" }, teamStatisticsTarget];
  const report = await importer.run({ targets, maxRequests: 4 });
  assert.equal(report.deferred, 4);
  assert.equal(report.requests, 4);
  assert.deepEqual(pages, []);
  assert.equal((await adapter.reference.page({ ...teamStatisticsTarget, teamId: 0 }, catalogBounds())).error.reason, "invalid-request");

  const wrongCount = setup((url) => teamStatisticsResponse(url, teamStatistics, { results: 1 }));
  assert.equal((await wrongCount.adapter.reference.page(teamStatisticsTarget, catalogBounds())).error.reason, "schema-error");
  const wrongDate = setup((url) => teamStatisticsResponse(url, teamStatistics, { parameters: { ...teamStatisticsParameters, date: "2026-01-01" } }));
  assert.equal((await wrongDate.adapter.reference.page(teamStatisticsTarget, catalogBounds())).error.reason, "schema-error");
});

test("team-statistics planning reads bounded unarchived home and away team-season scopes", async () => {
  const queries = [];
  const database = { query: (callback) => callback({
    footballSeason: { async findMany() { return []; } },
    fixtureFacts: { async findMany() { return []; } },
    footballTeamProvider: { async findMany() { return []; } },
    async $queryRaw(query) {
      queries.push(query);
      if (!query.sql.includes("archived.endpoint = 'teamStatistics'")) return [];
      return [{ competitionId: 39n, season: 2026, teamId: 10n }, { competitionId: 39n, season: 2025, teamId: 11n }];
    },
  }) };
  assert.deepEqual(await readHistoryReferenceTargets(database, [39], "countries", 1), { targets: [{ endpoint: "countries" }], hasMoreTargets: false });
  const plan = await readHistoryReferenceTargets(database, [39], "team-statistics", 1);
  assert.deepEqual(plan, { targets: [{ ...teamStatisticsTarget, season: 2026 }], hasMoreTargets: true });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /homeTeamId AS teamId[\s\S]+UNION[\s\S]+awayTeamId AS teamId/u);
  assert.match(queries[0].sql, /ORDER BY season\.year DESC, league\.externalId, team\.externalId\s+LIMIT \?/u);
  assert.ok(queries[0].sql.includes(`SHA2(CONCAT('{"league":"', league.externalId, '","season":"', season.year, '","team":"', team.externalId, '"}'), 256)`));
  assert.deepEqual(queries[0].values.slice(-2), [39n, 2]);
  const defaultPlan = await readHistoryReferenceTargets(database, [39], undefined, 1);
  assert.deepEqual(defaultPlan, { targets: [{ endpoint: "countries" }, { endpoint: "timezones" }, { endpoint: "leagueSeasons" }, ...plan.targets],
    hasMoreTargets: true });
});

test("the private source writer uses the same team-statistics hash and allows empty global selectors", async () => {
  const stored = [];
  const archive = createFootballHistorySource({ query: (callback) => callback({ footballHistorySourcePage: {
    async createMany({ data }) { stored.push(data); return { count: 1 }; },
    async findFirst({ where }) { return stored.find((page) => page.endpoint === where.endpoint && page.selectorHash === where.selectorHash) ?? null; },
  } }) });
  await archive.savePage({ endpoint: "countries", parameters: {}, rows: countryRows, retrievedAt: CATALOG_NOW });
  const selector = { endpoint: "teamStatistics", parameters: { team: "10", season: "2025", league: "39" } };
  await archive.savePage({ ...selector, rows: [teamStatistics], retrievedAt: CATALOG_NOW });
  assert.equal(stored[1].selectorHash, catalogHash(JSON.stringify(teamStatisticsParameters)));
  assert.deepEqual((await archive.latestPage(selector)).rows, [teamStatistics]);
  await assert.rejects(archive.savePage({ ...selector, parameters: { team: "10" }, rows: [], retrievedAt: CATALOG_NOW }), /Invalid historical archive selector/u);
});

const coachTarget = { endpoint: "coaches", teamId: 10 };
const squadTarget = { endpoint: "squads", teamId: 10 };
const coachRows = [{ id: 54, team: { id: 20 }, career: [{ team: { id: 20 }, start: "2026-07-01", end: null },
  { team: { id: 10 }, start: "2023-05-01", end: "2026-06-01" }] }, { id: 55, team: { id: 10 }, career: [] }];
const squadRows = [{ team: { id: 10 }, players: [{ id: 123, position: "Goalkeeper" }, { id: 124, number: null }] }];

test("archives scoped coach careers and current squads as timestamped team pages", async () => {
  const { importer, transport, pages } = setup((url) => catalogResponse(url, url.pathname === "/coachs" ? coachRows : squadRows));
  const targets = [coachTarget, squadTarget];
  assert.equal((await importer.run({ targets, maxRequests: 2 })).archived, 2);
  assert.deepEqual(transport.map((url) => [url.pathname, url.search]), [["/coachs", "?team=10"], ["/players/squads", "?team=10"]]);
  assert.deepEqual(pages, [{ endpoint: "coaches", parameters: { team: "10" }, rows: coachRows, retrievedAt: CATALOG_NOW + 100 },
    { endpoint: "squads", parameters: { team: "10" }, rows: squadRows, retrievedAt: CATALOG_NOW + 200 }]);
  assert.equal((await importer.run({ targets, maxRequests: 1 })).skipped, 2);
  assert.equal(transport.length, 2);

  const stored = [];
  const archive = createFootballHistorySource({ query: (callback) => callback({ footballHistorySourcePage: {
    async createMany({ data }) { stored.push(data); return { count: 1 }; },
  } }) });
  for (const page of pages) await archive.savePage(page);
  assert.deepEqual(stored.map(({ endpoint, selectorHash }) => [endpoint, selectorHash]),
    ["coaches", "squads"].map((endpoint) => [endpoint, catalogHash('{"team":"10"}')]));
});

test("coach and squad pages reject unrelated teams, repeated players, and an unexpected player selector", async () => {
  const unrelated = setup((url) => catalogResponse(url, url.pathname === "/coachs"
    ? [{ ...coachRows[0], career: coachRows[0].career.slice(0, 1) }]
    : [{ ...squadRows[0], team: { id: 20 } }]));
  assert.equal((await unrelated.importer.run({ targets: [coachTarget, squadTarget], maxRequests: 2 })).deferred, 2);
  assert.deepEqual(unrelated.pages, []);

  const duplicate = setup((url) => catalogResponse(url, [{ ...squadRows[0], players: [squadRows[0].players[0], squadRows[0].players[0]] }]));
  assert.equal((await duplicate.adapter.reference.page(squadTarget, catalogBounds())).error.reason, "schema-error");
  const unexpected = setup((url) => {
    url.searchParams.set("player", "123");
    return catalogResponse(url, squadRows);
  });
  assert.equal((await unexpected.adapter.reference.page(squadTarget, catalogBounds())).error.reason, "schema-error");
});

test("canonical observed teams feed the explicit coach and squad selectors and the shared default order", async () => {
  const queries = [];
  const database = { query: (callback) => callback({
    footballSeason: { async findMany() { return []; } },
    fixtureFacts: { async findMany() { return []; } },
    footballTeamProvider: { async findMany(query) {
      queries.push(query);
      return [{ externalId: 10n, team: { providers: [{ externalId: 10n }] } },
        { externalId: 20n, team: { providers: [{ externalId: 20n }, { externalId: 21n }] } }];
    } },
    async $queryRaw(query) { return query.sql.includes("archived.endpoint = 'teamStatistics'") ? [{ competitionId: 39n, season: 2025, teamId: 10n }] : []; },
  }) };
  assert.deepEqual((await readHistoryReferenceTargets(database, [39], "coaches", 3)).targets, [coachTarget]);
  assert.deepEqual((await readHistoryReferenceTargets(database, [39], "squads", 3)).targets, [squadTarget]);
  const { targets } = await readHistoryReferenceTargets(database, [39], undefined, 3);
  assert.deepEqual(targets.slice(-6), [{ endpoint: "transfers", teamId: 10 }, { endpoint: "transfers", teamId: 20 },
    coachTarget, teamStatisticsTarget, squadTarget, { endpoint: "teamSeasons", teamId: 10 }]);
  const [home, away] = queries[0].where.team.OR;
  assert.deepEqual(home.homeFixtures.some, away.awayFixtures.some);
  assert.deepEqual(home.homeFixtures.some.season.competition.providers.some.externalId.in, [39n]);

  const { importer, transport } = setup((url) => catalogResponse(url, []));
  await importer.run({ targets, maxRequests: 8 });
  assert.deepEqual(transport.map(({ pathname }) => pathname), ["/countries", "/timezone", "/leagues/seasons", "/transfers",
    "/transfers", "/coachs", "/teams/statistics", "/players/squads"]);
});

const roundsTarget = { endpoint: "fixtureRounds", competitionId: 39, season: 2025 };
const teamSeasonsTarget = { endpoint: "teamSeasons", teamId: 10 };
const roundsRows = [{ round: "Regular Season - 1", dates: ["2025-08-16", "2025-08-17"] }];
const teamSeasonsRows = [2022, 2023, 2025];

function teamSeasonsResponse(url, rows, results) {
  return new Response(JSON.stringify({ get: "teams/seasons", parameters: Object.fromEntries(url.searchParams),
    errors: [], results, paging: { current: 1, total: 1 }, response: rows }), { headers: { "content-type": "application/json" } });
}

test("regular round coverage reuses fallback pages and archives the documented team-seasons envelope", async () => {
  const { importer, transport, pages } = setup((url) => url.pathname === "/teams/seasons"
    ? teamSeasonsResponse(url, teamSeasonsRows, 1) : catalogResponse(url, roundsRows));
  const saved = { endpoint: "fixtureRounds", parameters: apiFootballFixtureRoundParameters(roundsTarget), rows: roundsRows, retrievedAt: CATALOG_NOW };
  pages.push(saved);
  const missingRound = { ...roundsTarget, season: 2024 };
  const result = await importer.run({ targets: [roundsTarget, missingRound, teamSeasonsTarget], maxRequests: 2 });
  assert.equal(result.skipped, 1);
  assert.equal(result.archived, 2);
  assert.deepEqual(transport.map(({ pathname }) => pathname), ["/fixtures/rounds", "/teams/seasons"]);
  assert.deepEqual(Object.fromEntries(transport[0].searchParams), apiFootballFixtureRoundParameters(missingRound));
  assert.deepEqual(pages.slice(1), [{ endpoint: "fixtureRounds", parameters: apiFootballFixtureRoundParameters(missingRound),
    rows: roundsRows, retrievedAt: CATALOG_NOW + 100 },
  { endpoint: "teamSeasons", parameters: { team: "10" }, rows: teamSeasonsRows, retrievedAt: CATALOG_NOW + 200 }]);
});

test("round and team-season pages reject restricted round lists, invalid seasons, and inconsistent results", async () => {
  const restricted = setup((url) => {
    url.searchParams.set("current", "true");
    return catalogResponse(url, roundsRows);
  });
  assert.equal((await restricted.adapter.reference.page(roundsTarget, catalogBounds())).error.reason, "schema-error");
  const wrongCount = setup((url) => teamSeasonsResponse(url, teamSeasonsRows, 2));
  assert.equal((await wrongCount.adapter.reference.page(teamSeasonsTarget, catalogBounds())).error.reason, "schema-error");
  const wrongYear = setup((url) => teamSeasonsResponse(url, ["2025"], 1));
  assert.equal((await wrongYear.adapter.reference.page(teamSeasonsTarget, catalogBounds())).error.reason, "schema-error");
  const rowCount = setup((url) => teamSeasonsResponse(url, teamSeasonsRows, teamSeasonsRows.length));
  assert.equal((await rowCount.adapter.reference.page(teamSeasonsTarget, catalogBounds())).status, "complete");
});

test("round discovery reads only observed unarchived league-season selectors with the fallback archive hash", async () => {
  const queries = [];
  const database = { query: (callback) => callback({
    async $queryRaw(query) {
      queries.push(query);
      return [{ competitionId: 39n, season: 2025 }, { competitionId: 39n, season: 2024 }];
    },
    footballTeamProvider: { async findMany() { return [{ externalId: 10n, team: { providers: [{ externalId: 10n }] } }]; } },
  }) };
  assert.deepEqual(await readHistoryReferenceTargets(database, [39], "rounds", 1), { targets: [roundsTarget], hasMoreTargets: true });
  assert.deepEqual(await readHistoryReferenceTargets(database, [39], "team-seasons", 1), { targets: [teamSeasonsTarget], hasMoreTargets: false });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /EXISTS \(SELECT 1 FROM FootballFixture AS fixture WHERE fixture\.seasonId = season\.id/u);
  assert.match(queries[0].sql, /archived\.endpoint = 'fixtureRounds'[\s\S]+"dates":"true","league":"[\s\S]+"timezone":"Africa\/Kampala"/u);
  assert.deepEqual(queries[0].values, ["api-football", 39n, "api-football", 2]);

  const saved = [];
  const archive = createFootballHistorySource({ query: (callback) => callback({ footballHistorySourcePage: {
    async createMany({ data }) { saved.push(data); return { count: 1 }; },
  } }) });
  await archive.savePage({ endpoint: "fixtureRounds", parameters: apiFootballFixtureRoundParameters(roundsTarget), rows: roundsRows, retrievedAt: CATALOG_NOW });
  assert.equal(saved[0].selectorHash, catalogHash('{"dates":"true","league":"39","season":"2025","timezone":"Africa/Kampala"}'));
});

const leaderboardTargets = Object.keys(apiFootballLeaderboards).map((endpoint) => ({ endpoint, competitionId: 39, season: 2025 }));
const leaderboardRow = (id, overrides = {}) => ({ player: { id }, statistics: [{ league, team: { id: 10 },
  goals: { total: 10, assists: 4 }, cards: { yellow: 2, red: 1 }, ...overrides }] });

test("archives all four documented leaderboards in provider rank order under one request per selector", async () => {
  const { importer, transport, pages } = setup((url) => {
    assert.deepEqual(Object.fromEntries(url.searchParams), { league: "39", season: "2025" });
    return catalogResponse(url, [leaderboardRow(99), leaderboardRow(2)]);
  });
  assert.deepEqual(await importer.run({ targets: leaderboardTargets, maxRequests: 4 }),
    { status: "complete", requested: 4, archived: 4, skipped: 0, deferred: 0, requests: 4, stopped: null });
  assert.deepEqual(transport.map(({ pathname }) => pathname), Object.values(apiFootballLeaderboards).map(({ path }) => path));
  assert.deepEqual(pages.map(({ rows }) => rows.map(({ player }) => player.id)), Array.from({ length: 4 }, () => [99, 2]));
  assert.equal((await importer.run({ targets: leaderboardTargets, maxRequests: 1 })).skipped, 4);

  const stored = [];
  const archive = createFootballHistorySource({ query: (callback) => callback({ footballHistorySourcePage: {
    async createMany({ data }) { stored.push(data); return { count: 1 }; },
  } }) });
  for (const page of pages) await archive.savePage(page);
  assert.ok(stored.every(({ selectorHash }) => selectorHash === catalogHash('{"league":"39","season":"2025"}')));
});

test("leaderboard archives reject cross-season statistics, missing metrics, duplicate players, and more than 20 rows", async () => {
  const [target] = leaderboardTargets;
  const good = leaderboardRow(1), offScope = leaderboardRow(2, { league: { ...league, season: 2024 } });
  const cases = [
    [[{ ...good, statistics: [...good.statistics, ...offScope.statistics] }], "schema-error"],
    [[leaderboardRow(1, { goals: { total: -1 } })], "schema-error"],
    [[leaderboardRow(1, { goals: { assists: 4 } })], "schema-error"],
    [[good, good], "schema-error"],
    [Array.from({ length: 21 }, (_, index) => leaderboardRow(index + 1)), "pagination-incomplete"],
  ];
  for (const [rows, reason] of cases) {
    const { adapter } = setup((url) => catalogResponse(url, rows));
    assert.equal((await adapter.reference.page(target, catalogBounds())).error.reason, reason);
  }
  const extra = setup((url) => {
    url.searchParams.set("team", "10");
    return catalogResponse(url, [good]);
  });
  assert.equal((await extra.adapter.reference.page(target, catalogBounds())).error.reason, "schema-error");
});

test("leaderboard targets use observed seasons, advertised coverage and bounded archive lookups", async () => {
  const queries = [];
  const database = { query: (callback) => callback({ async $queryRaw(query) {
    queries.push(query);
    return [{ competitionId: 39n, season: 2025, endpoint: "topRedCards" }, { competitionId: 39n, season: 2024, endpoint: "topRedCards" }];
  } }) };
  assert.deepEqual(await readHistoryReferenceTargets(database, [39], "top-red-cards", 1),
    { targets: [leaderboardTargets[3]], hasMoreTargets: true });
  assert.match(queries[0].sql, /EXISTS \(SELECT 1 FROM FootballFixture AS fixture WHERE fixture\.seasonId = season\.id/u);
  assert.match(queries[0].sql, /JSON_UNQUOTE\(JSON_EXTRACT\(season\.coverage, requested\.coveragePath\)\)/u);
  assert.match(queries[0].sql, /archived\.endpoint = requested\.endpoint[\s\S]+SHA2\(CONCAT\('\{"league":"', league\.externalId/u);
  assert.deepEqual(queries[0].values, ["api-football", "topRedCards", "$.top_cards", 0, 39n, "api-football", 2]);
});
