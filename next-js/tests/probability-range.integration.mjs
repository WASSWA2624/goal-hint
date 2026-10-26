import assert from "node:assert/strict";
import test from "node:test";
import mariadb from "mariadb";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { parseFeedQuery, resolveFeedDates } from "../src/domain/feed-query.ts";
import { feedSql } from "../src/server/matches/feed-read.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

test("inclusive decimal probability filtering uses stored DOUBLE values on genuine isolated MySQL", { timeout: 120_000 }, async (t) => {
  let instance, connection;
  try {
    try { instance = await startIsolatedMysql(); }
    catch (error) {
      if (!(error instanceof MysqlServerUnavailableError)) throw error;
      t.skip(error.message); return;
    }
    connection = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", database: "goal_hint_test", timezone: "Z" });
    // The production query executes unchanged. Synthetic minimal tables avoid unrelated pipeline/migration work.
    // There is deliberately no odds table: the disabled public-odds branch must never read one.
    for (const statement of [
      "CREATE TABLE FootballTeam (id VARCHAR(36) PRIMARY KEY)",
      "CREATE TABLE FootballCompetition (id VARCHAR(36) PRIMARY KEY)",
      "CREATE TABLE FootballCompetitionProvider (competitionId VARCHAR(36), provider VARCHAR(32), externalId INT)",
      "CREATE TABLE FootballSeason (id VARCHAR(36) PRIMARY KEY, competitionId VARCHAR(36))",
      "CREATE TABLE FootballFixture (id VARCHAR(36) PRIMARY KEY, provider VARCHAR(32), homeTeamId VARCHAR(36), awayTeamId VARCHAR(36), seasonId VARCHAR(36), activeCycleId VARCHAR(36), kickoff DATETIME(3), status VARCHAR(32))",
      "CREATE TABLE PredictionCycle (id VARCHAR(36) PRIMARY KEY, fixtureId VARCHAR(36), state VARCHAR(16), currentSetId VARCHAR(36), lockedSetId VARCHAR(36))",
      "CREATE TABLE PredictionSet (id VARCHAR(36), cycleId VARCHAR(36), cycleRevision INT)",
      "CREATE TABLE MarketPrediction (setId VARCHAR(36), family VARCHAR(32), selection VARCHAR(32), available BOOLEAN, selectedProbability DOUBLE, PRIMARY KEY(setId,family))",
      "INSERT INTO FootballTeam VALUES ('home'),('away')",
      "INSERT INTO FootballCompetition VALUES ('competition')",
      "INSERT INTO FootballCompetitionProvider VALUES ('competition','api-football',39)",
      "INSERT INTO FootballSeason VALUES ('season','competition')",
    ]) await connection.query(statement);
    for (const [id, probability] of [["decimal", 0.582], ["lower", 0.600041], ["upper", 0.600049], ["outside", 0.7], ["missing", null]]) {
      const cycle = probability === null ? null : `cycle-${id}`, set = `set-${id}`;
      await connection.query("INSERT INTO FootballFixture VALUES (?,'api-football','home','away','season',?,'2026-10-12 10:00:00','scheduled')", [id, cycle]);
      if (cycle === null) continue;
      await connection.query("INSERT INTO PredictionCycle VALUES (?,?,'open',?,NULL)", [cycle, id, set]);
      await connection.query("INSERT INTO MarketPrediction VALUES (?,'match-result','home-win',TRUE,?)", [set, probability]);
    }
    const today = parseReportingDate("2026-10-12");
    async function read(prob) {
      const query = parseFeedQuery(new URLSearchParams({ prob }), { today });
      const sql = feedSql(query, resolveFeedDates(query, today), [39], false);
      const rows = await connection.query(`SELECT f.id ${sql.joins.sql} WHERE ${sql.where.sql} ORDER BY ${sql.order.sql}`, [...sql.joins.values, ...sql.where.values, ...sql.order.values]);
      return new Set(rows.map((row) => row.id));
    }
    assert.deepEqual(await read("58.2-58.2"), new Set(["decimal"]), "decimal-text scaling preserves the 0.582 DOUBLE equality boundary");
    assert.deepEqual(await read("60.0041-60.0049"), new Set(["lower", "upper"]), "both fractional endpoints are inclusive");
    assert.deepEqual(await read("60.0049-60.0049"), new Set(["upper"]));
    assert.deepEqual(await read("60-60"), new Set(), "rounded display percentages do not widen exact bounds");
    assert.deepEqual(await read("0-0"), new Set());
    assert.deepEqual(await read("100-100"), new Set());
    assert.deepEqual(await read("0-100"), new Set(["decimal", "lower", "upper", "outside", "missing"]), "the default range includes fixtures without forecasts");
    assert.deepEqual(await read("0-99.9"), new Set(["decimal", "lower", "upper", "outside"]), "non-default bounds require a shown pick");
  } finally {
    if (connection) await connection.end();
    if (instance) await instance.stop();
  }
});
