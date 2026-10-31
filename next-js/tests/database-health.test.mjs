import assert from "node:assert/strict";
import test from "node:test";
import { databaseHealth } from "../src/server/database/health.ts";

test("database health checks current account fields with zero-row reads after connecting", async () => {
  const statements = [];
  const status = await databaseHealth({ async readiness() { return "ready"; }, async query(run) {
    return run({ async $queryRaw(statement) { statements.push(statement); return []; } });
  } });
  assert.equal(status, "ready");
  assert.equal(statements.length, 5);
  for (const statement of statements) {
    assert.match(statement.sql, /^SELECT .*\s+FROM `Member(?:Account|Session|Verification|Referral|Notification)` WHERE 1 = 0$/u);
    assert.deepEqual(statement.values, []);
  }
  const account = statements.find(statement => statement.sql.includes("FROM `MemberAccount`"));
  assert.match(account.sql, /`phoneVerifiedAt`/u);
  assert.match(account.sql, /`passwordChangedAt`/u);
  assert.match(account.sql, /`referralCode`/u);
  const verification = statements.find(statement => statement.sql.includes("FROM `MemberVerification`"));
  assert.match(verification.sql, /`channel`/u);
});

test("a live connection with missing account schema or SELECT grants fails health without leaking diagnostics", async () => {
  for (const table of ["MemberAccount", "MemberSession", "MemberVerification", "MemberReferral", "MemberNotification"]) {
    const status = await databaseHealth({ async readiness() { return "ready"; }, async query(run) {
      return run({ async $queryRaw(statement) {
        if (statement.sql.includes(`FROM \`${table}\``)) throw new Error("Synthetic private SQL and credential diagnostics");
        return [];
      } });
    } });
    assert.equal(status, "schema-unavailable");
  }
});

test("a connection outage does not attempt account schema reads", async () => {
  let schemaReads = 0;
  assert.equal(await databaseHealth({ async readiness() { return "unavailable"; }, async query() { schemaReads++; } }), "unavailable");
  assert.equal(schemaReads, 0);
});
