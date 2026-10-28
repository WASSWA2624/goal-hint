import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
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
      "CREATE TABLE FootballFixture (id VARCHAR(36) PRIMARY KEY, provider VARCHAR(32), homeTeamId VARCHAR(36), awayTeamId VARCHAR(36), seasonId VARCHAR(36), activeCycleId VARCHAR(36), kickoff DATETIME(3), status VARCHAR(32), INDEX FootballFixture_kickoff_idx(kickoff))",
      "CREATE TABLE PredictionCycle (id VARCHAR(36) PRIMARY KEY, fixtureId VARCHAR(36), state VARCHAR(16), currentSetId VARCHAR(36), lockedSetId VARCHAR(36))",
      "CREATE TABLE PredictionSet (id VARCHAR(36) PRIMARY KEY, cycleId VARCHAR(36), cycleRevision INT, candidateJson JSON)",
      "CREATE TABLE MarketPrediction (setId VARCHAR(36), family VARCHAR(32), selection VARCHAR(32), available BOOLEAN, selectedProbability DOUBLE, PRIMARY KEY(setId,family))",
      "INSERT INTO FootballTeam VALUES ('home'),('away')",
      "INSERT INTO FootballCompetition VALUES ('competition')",
      "INSERT INTO FootballCompetitionProvider VALUES ('competition','api-football',39)",
      "INSERT INTO FootballSeason VALUES ('season','competition')",
    ]) await connection.query(statement);
    await connection.query(await readFile(new URL("../prisma/migrations/20261028120000_compact_feed_recommendation/migration.sql", import.meta.url), "utf8"));
    await connection.query(await readFile(new URL("../prisma/migrations/20261028121000_feed_choice_covering_index/migration.sql", import.meta.url), "utf8"));
    for (const [id, probability] of [["decimal", 0.582], ["lower", 0.600041], ["upper", 0.600049], ["outside", 0.7], ["missing", null]]) {
      const cycle = probability === null ? null : `cycle-${id}`, set = `set-${id}`;
      await connection.query("INSERT INTO FootballFixture VALUES (?,'api-football','home','away','season',?,'2026-10-12 10:00:00','scheduled')", [id, cycle]);
      if (cycle === null) continue;
      await connection.query("INSERT INTO PredictionCycle VALUES (?,?,'open',?,NULL)", [cycle, id, set]);
      await connection.query("INSERT INTO PredictionSet(id,cycleId,cycleRevision,candidateJson) VALUES (?,?,1,JSON_OBJECT())", [set, cycle]);
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
    const [legacy] = await connection.query("SELECT feedRecommendation IS NULL AS absent FROM PredictionSet WHERE id='set-decimal'");
    assert.equal(Number(legacy.absent), 1, "legacy candidates retain no recommendation decision");
    await connection.query("UPDATE PredictionSet SET candidateJson=? WHERE id='set-outside'", [JSON.stringify({ audit: { recommendation: {
      selected: { family: "match-result", selection: "away-win", probability: 0.2, quote: { decimal: "2.345" } } } } })]);
    assert.deepEqual(await read("20-20"), new Set(["outside"]), "the generated probability retains the exact chosen recommendation");
    await connection.query("UPDATE PredictionSet SET candidateJson=? WHERE id='set-outside'", [JSON.stringify({ audit: { recommendation: { selected: null } } })]);
    const [abstention] = await connection.query("SELECT feedRecommendation IS NOT NULL AS decision FROM PredictionSet WHERE id='set-outside'");
    assert.equal(Number(abstention.decision), 1, "an explicit abstention remains distinct from an absent decision");
    assert.deepEqual(await read("0-99.9"), new Set(["decimal", "lower", "upper"]), "all-market filtering respects the original abstention");
  } finally {
    if (connection) await connection.end();
    if (instance) await instance.stop();
  }
});
