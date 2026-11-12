import assert from "node:assert/strict";
import test from "node:test";
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

test("verified player and coach source pages advance durably without indexing corrupt source", async () => {
  const pages = [], subjects = new Set(), transactions = [];
  let readableCounts = true;
  const client = {
    footballHistorySourcePage: { async createMany({ data }) { pages.push({ ...data, subjectIndexStatus: null }); } },
    async $queryRaw(sql, ...values) {
      if (sql.sql?.includes("subjectIndexStatus = 'invalid'")) return pages.filter((page) => page.subjectIndexStatus === "invalid");
      if (Array.isArray(sql) && sql.join("?").includes("FROM FootballHistorySubject")) {
        assert.match(sql.join("?"), /SHA2\(CONCAT\(/u);
        assert.deepEqual(values, ["player", "playerTeams", '{"player":"', 20]);
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
