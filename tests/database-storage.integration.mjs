import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { measureDatabaseStorage, databaseStorageReport } from "../src/server/database/storage.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

test("storage queries on an owned genuine MySQL return aggregate bytes and restore session settings with SELECT-only table grants", { timeout: 120_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Storage-query acceptance remains pending.`); return;
  }
  const password = randomBytes(24).toString("hex");
  let database;
  try {
    await instance.assertOwnership();
    await instance.executeAdmin(`
      CREATE TABLE PredictionSet (id CHAR(36) PRIMARY KEY, candidateJson JSON NOT NULL) ENGINE=InnoDB;
      CREATE TABLE FixtureResult (id CHAR(64) PRIMARY KEY, body JSON NOT NULL) ENGINE=InnoDB;
      CREATE TABLE MemberAccount (id CHAR(36) PRIMARY KEY, privateValue VARCHAR(128)) ENGINE=InnoDB;
      INSERT INTO PredictionSet VALUES ('one', JSON_OBJECT('claim', 'synthetic private text'));
      INSERT INTO PredictionSet VALUES ('two', JSON_OBJECT('claim', 'synthetic longer private text'));
      INSERT INTO MemberAccount VALUES ('private-member', 'must-not-leave-the-database');
      CREATE USER 'storage_reader'@'127.0.0.1' IDENTIFIED BY '${password}';
      GRANT SELECT ON goal_hint_test.* TO 'storage_reader'@'127.0.0.1';
    `);
    database = createDatabase(parseRuntimePolicy({ NODE_ENV: "test", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
      TEST_DATABASE_URL: `mysql://storage_reader:${password}@127.0.0.1:${instance.port}/goal_hint_test`,
      GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_POOL_LIMIT: "1",
      GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000", GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "2000" }));
    const setting = () => database.query(async (tx) => Number((await tx.$queryRaw`SELECT @@SESSION.information_schema_stats_expiry AS seconds`)[0].seconds));
    const before = await setting();
    const first = await measureDatabaseStorage(database, 1);
    assert.equal(await setting(), before);
    const table = (measurement, name) => measurement.tables.find((item) => item.table.toLowerCase() === name.toLowerCase());
    const sample = table(first, "PredictionSet").sample;
    assert.equal(sample.state, "measured"); assert.equal(sample.rows, 1); assert.ok(sample.jsonBytes > 0);
    assert.equal(sample.averageJsonBytes, sample.jsonBytes); assert.equal(sample.maximumJsonBytes, sample.jsonBytes);
    const empty = table(first, "FixtureResult").sample;
    assert.equal(empty.rows, 0); assert.equal(empty.jsonBytes, 0); assert.equal(empty.averageJsonBytes, null);
    assert.equal(table(first, "MemberAccount").sample, null);
    assert.ok(first.allocatedBytes > 0); assert.ok(!JSON.stringify(first).includes("private text"));
    assert.ok(!JSON.stringify(first).includes("must-not-leave"));
    const next = await measureDatabaseStorage(database, 2);
    assert.equal(table(next, "PredictionSet").sample.rows, 2);
    assert.equal(next.databaseKey, first.databaseKey);
    assert.equal(databaseStorageReport(next, first).comparison.state, next.measuredAt > first.measuredAt ? "compared" : "not-comparable");
  } finally {
    await database?.disconnect();
    await instance.stop();
  }
});
