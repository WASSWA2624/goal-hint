import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const bridge = new URL("../src/server/operations/cli-bridge.mjs", import.meta.url);
const client = new URL("../src/server/database/client.ts", import.meta.url).href;
const verifier = new URL("../src/server/database/operator-evidence.ts", import.meta.url).href;
const sentinel = "synthetic-private-database-password";
const production = {
  NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true",
  DATABASE_URL: `mysql://synthetic_app:${sentinel}@synthetic.invalid/goal_hint`,
  MIGRATION_DATABASE_URL: `mysql://synthetic_migration:${sentinel}@synthetic.invalid/goal_hint`,
  GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "1",
  GOAL_HINT_DATABASE_TLS_MODE: "required", GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-access",
  GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget",
};
const approval = (requirement, reference) => ({ requirement, reference, approvedAt: "2026-10-12", decision: "Synthetic test approval." });
const approvals = [approval("database-access", "synthetic-access"), approval("budget-approval", "synthetic-budget")];
const register = (entries = approvals) => JSON.stringify({ version: 1, owner: "Synthetic operator", approvals: entries });

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "goal-hint-operator-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  await mkdir(join(path, ".goal-hint"));
  return path;
}

async function run(cwd, args, input, settings = production) {
  // Neither real app configuration nor the repository's private register reaches the child.
  const env = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const pending = execFileAsync(process.execPath, ["--conditions=react-server", ...args], {
    cwd, env: { ...env, ...settings }, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  pending.child.stdin.end(input);
  try { return { ...await pending, exitCode: 0 }; }
  catch (error) {
    if (typeof error.code !== "number") throw error;
    return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
  }
}

async function prepare(cwd, command = "deploy", settings = production) {
  const result = await run(cwd, [fileURLToPath(bridge)], JSON.stringify({ action: "database-prepare", payload: { command } }), settings);
  assert.equal(result.stderr, "");
  return { ...result, response: JSON.parse(result.stdout.split("\x1e").at(-1)) };
}

test("hosted migration preparation requires both exact private approvals and redacts failed records", async (t) => {
  const cwd = await directory(t), file = join(cwd, ".goal-hint/owner-approvals.json");
  for (const content of [null, `malformed ${sentinel}`, register([approvals[0]]), register([approvals[1]]),
    register([approval("database-access", "different-target"), approvals[1]])]) {
    if (content !== null) await writeFile(file, content);
    const result = await prepare(cwd);
    assert.equal(result.exitCode, 1);
    assert.equal(result.response.ok, false);
    assert.match(result.response.error, /GOAL_HINT_(DATABASE_ACCESS|BUDGET_APPROVAL)_REF/u);
    assert.ok(!result.stdout.includes(sentinel));
  }
  await writeFile(file, register());
  for (const command of ["deploy", "status", "verify"]) {
    const result = await prepare(cwd, command);
    assert.equal(result.exitCode, 0);
    assert.equal(result.response.ok, true);
    const url = new URL(result.response.value.migrationUrl);
    assert.equal(url.username, "synthetic_migration");
    assert.equal(url.hostname, "synthetic.invalid");
    assert.equal(url.searchParams.get("sslaccept"), "strict");
  }
  const missingCredential = await prepare(cwd, "deploy", { ...production, MIGRATION_DATABASE_URL: "" });
  assert.equal(missingCredential.response.ok, false);
  assert.match(missingCredential.response.error, /MIGRATION_DATABASE_URL/u);
  const sameRole = await prepare(cwd, "deploy", { ...production, MIGRATION_DATABASE_URL: production.DATABASE_URL });
  assert.equal(sameRole.response.ok, false);
  assert.match(sameRole.response.error, /separate privileged role/u);
});

test("local migrations and offline generation never require a private approval register", async (t) => {
  const cwd = await directory(t);
  const local = { NODE_ENV: "development", GOAL_HINT_DATABASE_ENABLED: "true",
    DATABASE_URL: "mysql://synthetic_app@127.0.0.1/goal_hint",
    MIGRATION_DATABASE_URL: "mysql://synthetic_migration@127.0.0.1/goal_hint" };
  assert.equal((await prepare(cwd, "deploy", local)).response.ok, true);
  assert.deepEqual((await prepare(cwd, "generate", {})).response, { ok: true, value: { migrationUrl: null } });
  const remoteMigration = { ...local, ...production, NODE_ENV: "development", DATABASE_URL: local.DATABASE_URL };
  assert.equal((await prepare(cwd, "deploy", remoteMigration)).response.ok, false, "a local web target cannot authorize remote migration access");
});

test("web database access loads private approvals, preserves explicit denial and checks cached-pool revocation", async (t) => {
  const cwd = await directory(t);
  const source = `
    import assert from "node:assert/strict";
    import { writeFileSync } from "node:fs";
    import { getDatabase, disconnectDatabase } from ${JSON.stringify(client)};
    import { createDatabaseEvidenceVerifier } from ${JSON.stringify(verifier)};
    assert.throws(() => getDatabase(), /GOAL_HINT_BUDGET_APPROVAL_REF/);
    writeFileSync(".goal-hint/owner-approvals.json", ${JSON.stringify(register())});
    const first = getDatabase();
    try {
      assert.equal(getDatabase(), first);
      assert.throws(() => getDatabase(() => false), /GOAL_HINT_BUDGET_APPROVAL_REF/);
      assert.equal(createDatabaseEvidenceVerifier()("synthetic-budget", "release-approval"), false);
      writeFileSync(".goal-hint/owner-approvals.json", ${JSON.stringify(register([approvals[1]]))});
      assert.throws(() => getDatabase(), /GOAL_HINT_DATABASE_ACCESS_REF/);
    } finally { await disconnectDatabase(); }
    process.stdout.write("private database gates passed");
  `;
  const result = await run(cwd, ["--input-type=module", "--eval", source]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "private database gates passed");
  assert.equal(result.stderr, "");
});

test("disabled web database access fails at the capability gate without requiring approvals", async (t) => {
  const cwd = await directory(t);
  const source = `
    import assert from "node:assert/strict";
    import { getDatabase } from ${JSON.stringify(client)};
    assert.throws(() => getDatabase(), error => error.name === "RuntimePolicyError"
      && error.issues.some(issue => issue.field === "GOAL_HINT_DATABASE_ENABLED")
      && !error.issues.some(issue => issue.reason.includes("Verified")));
  `;
  const result = await run(cwd, ["--input-type=module", "--eval", source], undefined, {});
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
