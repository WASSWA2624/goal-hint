import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { inspect, promisify } from "node:util";
import { createDatabase, DatabaseOperationError } from "../src/server/database/client.ts";
import { databasePoolOptions, migrationConnectionUrl } from "../src/server/database/connection.ts";
import { parseRuntimePolicy, RuntimePolicyError } from "../src/server/config/runtime-policy.ts";

const execFileAsync = promisify(execFile);
const local = "mysql://synthetic:synthetic-local-password@127.0.0.1:1/goal_hint_test";
const remote = "mysql://synthetic:synthetic-remote-password@synthetic.invalid/goal_hint_main";

function testPolicy(overrides = {}) {
  return parseRuntimePolicy({
    NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", TEST_DATABASE_URL: local,
    GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "250",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "500", ...overrides,
  });
}

function configurationError(action, field, sentinel) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof RuntimePolicyError);
    assert.ok(error.issues.some((issue) => issue.field === field));
    if (sentinel) {
      for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error, { depth: null })]) {
        assert.ok(!output.includes(sentinel));
      }
    }
    return true;
  });
}

async function observableEndpoint(t) {
  let connections = 0;
  const server = createServer((socket) => { connections += 1; socket.destroy(); });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return { url: `mysql://synthetic:synthetic-local-password@127.0.0.1:${server.address().port}/goal_hint_test`, connections: () => connections };
}

test("a never-used local pool stays lazy and closes once without connector I/O", async (t) => {
  const endpoint = await observableEndpoint(t);
  const database = createDatabase(testPolicy({ TEST_DATABASE_URL: endpoint.url }));
  t.after(() => database.disconnect());
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(endpoint.connections(), 0);
  for (const output of [JSON.stringify(database), inspect(database, { depth: null })]) {
    assert.ok(!output.includes("synthetic-local-password"));
  }
  assert.equal(database.closed, false);
  assert.equal(await database.query(async (client) => {
    assert.equal(typeof client.$queryRaw, "function");
    return "synthetic callback result";
  }), "synthetic callback result");
  const firstClose = database.disconnect();
  assert.equal(database.disconnect(), firstClose);
  assert.equal(database.closed, true);
  await firstClose;
  await assert.rejects(database.query(async () => 1), (error) => error instanceof DatabaseOperationError && error.code === "closed");
  await assert.rejects(database.transaction(async () => 1), (error) => error instanceof DatabaseOperationError && error.code === "closed");
  assert.equal(await database.readiness(), "unavailable");
  assert.equal(endpoint.connections(), 0);
});

test("callback failures retain only stable classifications and never retry or expose diagnostics", async (t) => {
  const database = createDatabase(testPolicy());
  t.after(() => database.disconnect());
  const sentinel = "synthetic-driver-password-and-statement-sentinel";
  const cases = [
    ...["P2034"].map((code) => [{ code, message: sentinel }, "conflict"]),
    ...["P2002", "P2003", "P2011", "P2014"].map((code) => [{ code, message: sentinel }, "constraint"]),
    ...["P1000", "P1001", "P1002", "P1017", "P2024"].map((code) => [{ code, message: sentinel }, "unavailable"]),
    [new Error(sentinel), "failed"], [null, "failed"], [sentinel, "failed"],
    [{ get code() { throw new Error(sentinel); } }, "failed"],
    [{ code: { toString() { throw new Error(sentinel); } } }, "failed"],
    [new Proxy({}, { has() { throw new Error(sentinel); } }), "failed"],
  ];
  for (const [failure, expected] of cases) {
    let attempts = 0;
    await assert.rejects(database.query(async () => {
      attempts += 1;
      throw failure;
    }), (error) => {
      assert.ok(error instanceof DatabaseOperationError);
      assert.equal(error.code, expected);
      assert.equal(error.cause, undefined);
      for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error, { depth: null })]) {
        assert.ok(!output.includes(sentinel));
      }
      return true;
    });
    assert.equal(attempts, 1);
  }
});

test("production approval and disabled-capability gates run before pool creation", async (t) => {
  const endpoint = await observableEndpoint(t);
  configurationError(() => createDatabase(parseRuntimePolicy({})), "GOAL_HINT_DATABASE_ENABLED");
  const production = parseRuntimePolicy({
    NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: endpoint.url,
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
    GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-database-access-evidence",
    GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
  });
  configurationError(() => createDatabase(production), "GOAL_HINT_BUDGET_APPROVAL_REF");
  configurationError(() => createDatabase(production, () => false), "GOAL_HINT_BUDGET_APPROVAL_REF");
  assert.equal(endpoint.connections(), 0);
});

test("remote access requires approved direct mode and verified TLS without URL overrides", () => {
  configurationError(() => databasePoolOptions(testPolicy({ TEST_DATABASE_URL: remote, GOAL_HINT_DATABASE_ENABLED: "false" })), "GOAL_HINT_DATABASE_CONNECTION_MODE");
  const direct = { TEST_DATABASE_URL: remote, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_ENABLED: "false" };
  configurationError(() => databasePoolOptions(testPolicy(direct)), "GOAL_HINT_DATABASE_TLS_MODE");
  configurationError(() => databasePoolOptions(testPolicy({ ...direct, GOAL_HINT_DATABASE_TLS_MODE: "disabled" })), "GOAL_HINT_DATABASE_TLS_MODE");
  const options = databasePoolOptions(testPolicy({ ...direct, GOAL_HINT_DATABASE_TLS_MODE: "required" }));
  assert.deepEqual(options.ssl, { host: "synthetic.invalid", servername: "synthetic.invalid", rejectUnauthorized: true });
  const sentinel = "synthetic-query-override-secret-sentinel";
  configurationError(() => databasePoolOptions(testPolicy({
    TEST_DATABASE_URL: `${remote}?sslaccept=${sentinel}`, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_TLS_MODE: "required", GOAL_HINT_DATABASE_ENABLED: "false",
  })), "TEST_DATABASE_URL", sentinel);
});

test("connection decoding rejects invalid inputs and unreadable CA files without leaking supplied values", () => {
  const sentinel = "synthetic-encoding-and-ca-path-sentinel";
  for (const url of [
    `mysql://%E0%A4%A:${sentinel}@127.0.0.1/goal_hint_test`,
    `mysql://synthetic:${sentinel}%E0%A4%A@127.0.0.1/goal_hint_test`,
    `mysql://synthetic:${sentinel}@127.0.0.1/%E0%A4%A`,
    `mysql://synthetic:${sentinel}@127.0.0.1/goal%2Fhint`,
    `mysql://synthetic%0A${sentinel}@127.0.0.1/goal_hint_test`,
  ]) configurationError(() => databasePoolOptions(testPolicy({ TEST_DATABASE_URL: url })), "TEST_DATABASE_URL", sentinel);
  configurationError(() => databasePoolOptions(testPolicy({
    GOAL_HINT_DATABASE_TLS_CA_FILE: `synthetic-missing-${sentinel}.pem`,
  })), "GOAL_HINT_DATABASE_TLS_CA_FILE", sentinel);
  configurationError(() => databasePoolOptions(testPolicy({
    GOAL_HINT_DATABASE_TLS_MODE: "required", GOAL_HINT_DATABASE_TLS_CA_FILE: `synthetic-missing-${sentinel}.pem`,
  })), "GOAL_HINT_DATABASE_TLS_CA_FILE", sentinel);
  const options = databasePoolOptions(testPolicy({ TEST_DATABASE_URL: "mysql://goal%5Fhint:synthetic%40password@127.0.0.1/goal%5Fhint_test" }));
  assert.equal(options.user, "goal_hint");
  assert.equal(options.password, "synthetic@password");
  assert.equal(options.database, "goal_hint_test");
  assert.equal(options.minimumIdle, 0);
  assert.equal(options.timezone, "+00:00");
  assert.deepEqual(options.sessionVariables, { time_zone: "+00:00" });
});

test("migration credentials never fall back to the application role and production compares decoded roles", () => {
  assert.equal(migrationConnectionUrl(testPolicy()), null);
  const development = testPolicy({ MIGRATION_DATABASE_URL: "mysql://synthetic-migrator@127.0.0.1/goal_hint_test" });
  const url = new URL(migrationConnectionUrl(development));
  assert.equal(url.username, "synthetic-migrator");
  assert.equal(url.searchParams.get("connect_timeout"), "1");
  const production = {
    NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true",
    DATABASE_URL: "mysql://goal%5Fhint:synthetic-app-password@synthetic.invalid/goal_hint_main",
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
    GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-database-access-evidence",
    GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
  };
  configurationError(() => migrationConnectionUrl(parseRuntimePolicy({
    ...production, MIGRATION_DATABASE_URL: "mysql://goal_hint:synthetic-migration-password@synthetic.invalid/goal_hint_main",
  })), "MIGRATION_DATABASE_URL");
  const separate = migrationConnectionUrl(parseRuntimePolicy({
    ...production, MIGRATION_DATABASE_URL: "mysql://synthetic-migrator@synthetic.invalid/goal_hint_main",
  }));
  assert.equal(new URL(separate).searchParams.get("sslaccept"), "strict");
  assert.equal(new URL(separate).searchParams.get("prefer_socket"), "false");
});

test("debug diagnostics fail closed both at module load and before callback execution", async () => {
  const moduleUrl = new URL("../src/server/database/client.ts", import.meta.url).href;
  const policyUrl = new URL("../src/server/config/runtime-policy.ts", import.meta.url).href;
  const sentinel = "synthetic-database-debug-secret-sentinel";
  for (const initiallyEnabled of [false, true]) {
    const source = `
      import assert from "node:assert/strict";
      import { createDatabase } from ${JSON.stringify(moduleUrl)};
      import { parseRuntimePolicy, RuntimePolicyError } from ${JSON.stringify(policyUrl)};
      const policy = parseRuntimePolicy({ NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", TEST_DATABASE_URL: ${JSON.stringify(local)} });
      const check = (error) => error instanceof RuntimePolicyError
        && error.issues.some((issue) => issue.field === "DEBUG")
        && !error.message.includes(${JSON.stringify(sentinel)});
      if (${initiallyEnabled}) {
        delete process.env.DEBUG;
        assert.throws(() => createDatabase(policy), check);
      } else {
        const database = createDatabase(policy);
        try {
          process.env.DEBUG = ${JSON.stringify(sentinel)};
          let calls = 0;
          await assert.rejects(database.query(async () => { calls++; return 1; }), check);
          assert.equal(calls, 0);
          delete process.env.DEBUG;
          assert.equal(await database.query(async () => 1), 1);
        } finally { await database.disconnect(); }
      }
      process.stdout.write("synthetic debug guard passed");
    `;
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", source], {
      env: { ...process.env, DEBUG: initiallyEnabled ? sentinel : "" }, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
    });
    assert.equal(stdout, "synthetic debug guard passed");
    assert.equal(stderr, "");
  }
});

test("the process singleton survives module reloads and releases unused pools without connections", async (t) => {
  const endpoint = await observableEndpoint(t);
  const env = { ...process.env };
  const secretKeys = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || secretKeys.has(key)) delete env[key];
  }
  Object.assign(env, { NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", TEST_DATABASE_URL: endpoint.url, DEBUG: "" });
  const moduleUrl = new URL("../src/server/database/client.ts", import.meta.url).href;
  const source = `
    import assert from "node:assert/strict";
    import { getDatabase, disconnectDatabase } from ${JSON.stringify(moduleUrl)};
    const first = getDatabase();
    assert.equal(getDatabase(), first);
    const reload = await import(${JSON.stringify(`${moduleUrl}?synthetic-reload`)});
    assert.equal(reload.getDatabase(), first);
    await disconnectDatabase();
    await disconnectDatabase();
    assert.equal(first.closed, true);
    const fresh = getDatabase();
    assert.notEqual(fresh, first);
    await disconnectDatabase();
    process.stdout.write("synthetic unused singleton passed");
  `;
  const { stdout, stderr } = await execFileAsync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", source], {
    env, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stdout, "synthetic unused singleton passed");
  assert.equal(stderr, "");
  assert.equal(endpoint.connections(), 0);
});
