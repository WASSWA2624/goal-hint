import assert from "node:assert/strict";
import test from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createFootballHistoryReference } from "../src/server/football/history-reference.ts";
import { createFootballHistorySource } from "../src/server/football/history-source.ts";
import { readPendingHistorySubjectIds } from "../src/server/football/history-subjects.ts";
import { catalogResponse } from "./helpers/catalog-fixtures.mjs";
import { resultProvider } from "./helpers/result-sync-fixtures.mjs";

test("player career teams preserve provider rows and reuse complete and empty scoped responses", async () => {
  const now = Date.now() - 1_000, saved = [];
  const rows = [{ team: { id: 6, name: "National Team" }, seasons: [2026, 2023] },
    { team: { id: 10, name: "Club Team" }, seasons: [2025, 2024] }];
  const provider = resultProvider({ now: () => now }, { respond(url) {
    assert.equal(url.pathname, "/players/teams");
    const player = url.searchParams.get("player");
    assert.deepEqual(Object.fromEntries(url.searchParams), { player });
    if (player === "3") return catalogResponse(url, [rows[0], rows[0]]);
    if (player === "4") {
      const mismatched = new URL(url);
      mismatched.searchParams.set("player", "999");
      return catalogResponse(mismatched, rows);
    }
    return catalogResponse(url, player === "1" ? rows : []);
  } });
  const reference = createFootballHistoryReference({ reference: provider.adapter.reference,
    now: () => now, providerDayEndsAt: () => now + 60_000,
    async hasPage({ parameters }) { return saved.some((page) => page.parameters.player === parameters.player); },
    async savePage(page) { saved.push(page); } });
  const targets = [1, 2, 3, 4].map((playerId) => ({ endpoint: "playerTeams", playerId }));
  const result = await reference.run({ targets, maxRequests: 4 });
  assert.equal(result.archived, 2);
  assert.equal(result.deferred, 2);
  assert.deepEqual(saved.map(({ endpoint, parameters, rows: pageRows }) => [endpoint, parameters, pageRows]), [
    ["playerTeams", { player: "1" }, rows], ["playerTeams", { player: "2" }, []],
  ]);
  assert.equal((await reference.run({ targets: targets.slice(0, 2), maxRequests: 4 })).requests, 0);
  assert.equal(provider.network.length, 4);
});

test("direct player seasons and transfers preserve exact scoped pages without treating team history as a receipt", async () => {
  const now = Date.now() - 1_000, saved = [];
  const seasons = [2025, 2024];
  const transfers = [{ player: { id: 1, name: "Player" }, update: "2025-07-11T12:00:00+00:00",
    transfers: [{ date: "2025-07-10", type: null, teams: { in: { id: 10 }, out: { id: null } } }] }];
  const provider = resultProvider({ now: () => now }, { respond(url) {
    const player = url.searchParams.get("player"), isSeasons = url.pathname === "/players/seasons";
    assert.ok(isSeasons || url.pathname === "/transfers");
    assert.deepEqual(Object.fromEntries(url.searchParams), { player });
    const rows = isSeasons ? seasons : transfers;
    if (player === "2") return catalogResponse(url, []);
    if (player === "3") return catalogResponse(url, isSeasons ? [2025, 2025] : transfers);
    if (player === "4") {
      const unexpected = new URL(url);
      unexpected.searchParams.set("team", "10");
      return catalogResponse(unexpected, []);
    }
    if (player === "5") {
      const duplicate = { ...transfers[0], player: { id: 5 } };
      return catalogResponse(url, [duplicate, duplicate]);
    }
    return catalogResponse(url, rows);
  } });
  const reference = createFootballHistoryReference({ reference: provider.adapter.reference,
    now: () => now, providerDayEndsAt: () => now + 60_000,
    async hasPage({ endpoint, parameters }) {
      return saved.some((page) => page.endpoint === endpoint && JSON.stringify(page.parameters) === JSON.stringify(parameters));
    },
    async savePage(page) { saved.push(page); } });
  saved.push({ endpoint: "transfers", parameters: { team: "10" }, rows: transfers });
  const targets = ["playerSeasonHistory", "playerTransfers"].flatMap((endpoint) =>
    [1, 2, 3, 4].map((playerId) => ({ endpoint, playerId })));
  targets.push({ endpoint: "playerTransfers", playerId: 5 });
  const result = await reference.run({ targets, maxRequests: 9 });
  assert.equal(result.archived, 4);
  assert.equal(result.deferred, 5);
  assert.deepEqual(saved.slice(1).map(({ endpoint, parameters, rows }) => [endpoint, parameters, rows]), [
    ["playerSeasonHistory", { player: "1" }, seasons], ["playerSeasonHistory", { player: "2" }, []],
    ["playerTransfers", { player: "1" }, transfers], ["playerTransfers", { player: "2" }, []],
  ]);
  assert.equal((await reference.run({ targets: targets.filter(({ playerId }) => playerId <= 2), maxRequests: 8 })).requests, 0);
  assert.equal(provider.network.length, 9);
});

test("verified player and coach source pages advance durably without indexing corrupt source", async () => {
  const pages = [], subjects = new Set(), transactions = [];
  let readableCounts = true;
  const client = {
    footballHistorySourcePage: { async createMany({ data }) { pages.push({ ...data, subjectIndexStatus: null }); } },
    async $queryRaw(sql, ...values) {
      if (sql.sql?.includes("subjectIndexStatus = 'invalid'")) return pages.filter((page) => page.subjectIndexStatus === "invalid");
      if (Array.isArray(sql) && sql.join("?").includes("FROM FootballHistorySubject")) {
        assert.match(sql.join("?"), /SHA2\(CONCAT\(/u);
        assert.deepEqual(values, ["player", "player", "playerTeams", API_FOOTBALL_CONTRACT_VERSION, '{"player":"', 20]);
        return [{ externalId: 999n }];
      }
      const [endpoint, limit] = values;
      assert.equal(limit, 9);
      return pages.filter((page) => page.endpoint === endpoint && page.subjectIndexStatus === null).slice(0, limit)
        .map((page) => ({ ...page, rowCount: readableCounts ? BigInt(page.rowCount) : String(page.rowCount) }));
    },
    async $executeRaw(query) {
      if (query.sql.includes("INSERT INTO FootballHistorySubject")) {
        for (let index = 0; index < query.values.length; index += 2) subjects.add(`${query.values[index]}:${query.values[index + 1]}`);
      } else {
        const status = query.sql.includes("'indexed'") ? "indexed" : "invalid";
        for (const id of query.values) pages.find((page) => page.id === id).subjectIndexStatus = status;
      }
    },
  };
  const database = { query: (operation) => operation(client), transaction(operation) {
    transactions.push(true);
    return operation(client);
  } };
  const source = createFootballHistorySource(database), retrievedAt = Date.now() - 10_000;
  await source.savePlayerProfilePage({ page: 1, totalPages: 1, retrievedAt, rowCount: 1, rows: [{ player: { id: 15 } }] });
  await source.savePlayerProfilePage({ page: 1, totalPages: 1, retrievedAt: retrievedAt + 1, rowCount: 1, rows: [{ player: { id: 16 } }] });
  pages[1].contentHash = "bad";
  await source.savePlayerStatisticsPage({ competitionId: 39, season: 2025, page: 1, totalPages: 1, retrievedAt,
    rowCount: 1, rows: [{ player: { id: 15 }, statistics: [{ league: { id: 39, season: 2025 }, team: { id: 7 } }] }] });
  await source.savePage({ endpoint: "squads", parameters: { team: "8" }, retrievedAt, rows: [{ team: { id: 8 }, players: [{ id: 17 }] }] });
  await source.savePage({ endpoint: "coaches", parameters: { team: "8" }, retrievedAt, rows: [{ id: 15, career: [{ team: { id: 8 } }] }] });
  assert.deepEqual(await source.indexSubjects(), { indexed: 4, invalid: 1, hasMore: false, hasInvalid: true });
  assert.deepEqual([...subjects], ["player:15", "player:17", "coach:15"]);
  assert.equal(transactions.length, 4);
  assert.deepEqual(await source.indexSubjects(), { indexed: 0, invalid: 0, hasMore: false, hasInvalid: true });
  assert.equal(transactions.length, 4);
  assert.deepEqual(await readPendingHistorySubjectIds(database, "playerTeams", "player", 20), [999]);

  await source.savePlayerProfilePage({ page: 1, totalPages: 1, retrievedAt: retrievedAt + 2, rowCount: 1, rows: [{ player: { id: 18 } }] });
  readableCounts = false;
  await assert.rejects(source.indexSubjects(), /unsupported database shape/u);
  assert.equal(pages.at(-1).subjectIndexStatus, null);
  assert.equal(transactions.length, 4);
  readableCounts = true;
  assert.equal((await source.indexSubjects()).indexed, 1);
  assert.ok(subjects.has("player:18"));
});

test("fixture detail pages index historical coaches against the exact fixture and lineup teams", async () => {
  const pages = [], subjects = new Set();
  const client = {
    footballHistorySourcePage: { async createMany({ data }) { pages.push({ ...data, subjectIndexStatus: null }); } },
    async $queryRaw(query, ...values) {
      if (query.sql?.includes("subjectIndexStatus = 'invalid'")) return pages.filter((page) => page.subjectIndexStatus === "invalid");
      const [endpoint] = values;
      return pages.filter((page) => page.endpoint === endpoint && page.subjectIndexStatus === null);
    },
    async $executeRaw(query) {
      if (query.sql.includes("INSERT INTO FootballHistorySubject")) {
        for (let index = 0; index < query.values.length; index += 2) subjects.add(`${query.values[index]}:${query.values[index + 1]}`);
      } else {
        const status = query.sql.includes("'indexed'") ? "indexed" : "invalid";
        for (const id of query.values) pages.find((page) => page.id === id).subjectIndexStatus = status;
      }
    },
  };
  const database = { query: (operation) => operation(client), transaction: (operation) => operation(client) };
  const source = createFootballHistorySource(database), retrievedAt = Date.now() - 10_000;
  const fixture = (id, team, coach) => ({ fixture: { id }, teams: { home: { id: 10 }, away: { id: 20 } },
    lineups: [{ team: { id: team }, coach: { id: coach } }] });
  await source.savePage({ endpoint: "fixtures", parameters: { ids: "12-13-14-17", timezone: "Africa/Kampala" },
    retrievedAt, rows: [fixture(12, 10, 7), fixture(13, 20, 7), fixture(14, 10, null), fixture(17, 10, 0)] });
  await source.savePage({ endpoint: "fixtures", parameters: { id: "15" }, retrievedAt, rows: [fixture(15, 30, 8)] });
  await source.savePage({ endpoint: "fixtures", parameters: { id: "16" }, retrievedAt, rows: [fixture(999, 20, 9)] });
  await source.savePage({ endpoint: "coachProfiles", parameters: { id: "7" }, retrievedAt, rows: [{ id: 7, career: [] }] });
  await source.savePage({ endpoint: "teamsByCountry", parameters: { country: "England" }, retrievedAt,
    rows: [{ team: { id: 808, country: "England" } }] });
  assert.deepEqual(await source.indexSubjects(), { indexed: 3, invalid: 2, hasMore: false, hasInvalid: true });
  assert.deepEqual([...subjects], ["coach:7", "coachRef:7", "team:808"]);
  assert.deepEqual(pages.map(({ subjectIndexStatus }) => subjectIndexStatus), ["indexed", "invalid", "invalid", "indexed", "indexed"]);
});
