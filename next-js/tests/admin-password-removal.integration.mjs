import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import mariadb from "mariadb";
import { startIsolatedMysql, MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("retiring administrator password storage preserves registered recovery eligibility and ordinary credentials", { timeout: 180_000 }, async t => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  let connection;
  t.after(async () => { try { await connection?.end(); } finally { await instance.stop(); } });
  connection = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", database: instance.databaseName, multipleStatements: true });
  await connection.query(`CREATE TABLE MemberAccount (
    id CHAR(36) NOT NULL PRIMARY KEY, phone VARCHAR(32) NULL, erasedAt DATETIME(3) NULL,
    passwordHash VARCHAR(255) NULL, temporaryPasswordHash VARCHAR(255) NULL,
    temporaryPasswordExpiresAt DATETIME(3) NULL, passwordResetRequestedAt DATETIME(3) NULL,
    INDEX MemberAccount_passwordResetRequestedAt_idx (passwordResetRequestedAt)
  );
  CREATE TABLE OwnerAuditEvent (accountId CHAR(36) NULL, action VARCHAR(64) NOT NULL);`);
  const ids = Object.fromEntries(["normal", "pending", "consumed", "stub", "erased", "phoneLess", "normalWithOldTemp"].map(key => [key, randomUUID()]));
  const rows = [
    [ids.normal, "256700001001", null, "retained-ordinary-hash", null],
    [ids.pending, "256700001002", null, null, "obsolete-temp-hash"],
    [ids.consumed, "256700001003", null, null, null],
    [ids.stub, "256700001004", null, null, null],
    [ids.erased, "256700001005", new Date(), null, "obsolete-temp-hash"],
    [ids.phoneLess, null, null, null, "obsolete-temp-hash"],
    [ids.normalWithOldTemp, "256700001006", null, "retained-new-hash", "obsolete-temp-hash"],
  ];
  for (const row of rows) await connection.query("INSERT INTO MemberAccount (id,phone,erasedAt,passwordHash,temporaryPasswordHash) VALUES (?,?,?,?,?)", row);
  await connection.query("INSERT INTO OwnerAuditEvent (accountId,action) VALUES (?,?)", [ids.consumed, "password_reset"]);
  const audit = await connection.query("SELECT accountId,action FROM OwnerAuditEvent");
  const migration = await readFile(new URL("../prisma/migrations/20261029120000_remove_admin_password_requests/migration.sql", import.meta.url), "utf8");
  await connection.query(migration);
  const actual = new Map((await connection.query("SELECT id,passwordHash FROM MemberAccount")).map(row => [row.id, row.passwordHash]));
  assert.equal(actual.get(ids.normal), "retained-ordinary-hash");
  assert.equal(actual.get(ids.normalWithOldTemp), "retained-new-hash");
  for (const key of ["pending", "consumed"]) assert.equal(actual.get(ids[key]), "!self-service-recovery-required", key);
  for (const key of ["stub", "erased", "phoneLess"]) assert.equal(actual.get(ids[key]), null, key);
  assert.deepEqual(await connection.query("SELECT accountId,action FROM OwnerAuditEvent"), audit, "Historical audit evidence remains unchanged.");
  const columns = (await connection.query("SHOW COLUMNS FROM MemberAccount")).map(row => row.Field);
  assert.deepEqual(columns, ["id", "phone", "erasedAt", "passwordHash"]);
  const indexes = await connection.query("SHOW INDEX FROM MemberAccount");
  assert.ok(indexes.every(index => index.Key_name !== "MemberAccount_passwordResetRequestedAt_idx"));
});
