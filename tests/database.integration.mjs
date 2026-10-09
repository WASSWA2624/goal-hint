import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));

function isolatedEnvironment(url) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  }
  return {
    ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: url, MIGRATION_DATABASE_URL: url, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct",
    GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "disabled",
    GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000", GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "2000",
  };
}

async function runNode(args, env) {
  return execFileAsync(process.execPath, ["--conditions=react-server", ...args], {
    cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024,
  });
}

test("isolated genuine MySQL migration, transaction and lifecycle contracts", { timeout: 240000 }, async (t) => {
  let instance;
  try {
    instance = await startIsolatedMysql();
  } catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. This run does not qualify a separate MySQL 8.4 LTS deployment.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex");
  const applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://goal_hint_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://goal_hint_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = { ...isolatedEnvironment(applicationUrl), MIGRATION_DATABASE_URL: migrationUrl };
  let database;
  let migrationDatabase;
  try {
    await instance.executeAdmin(`
      CREATE USER 'goal_hint_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'goal_hint_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER
        ON goal_hint_test.* TO 'goal_hint_migration'@'127.0.0.1';
    `);
    await t.test("separate migration account deploys, repeats, reports status and verifies the schema", async () => {
      await instance.assertOwnership();
      await runNode([script, "deploy"], env);
      await runNode([script, "deploy"], env);
      await runNode([script, "status"], env);
      await runNode([script, "verify"], env);
      const { createDatabase } = await import("../src/server/database/client.ts");
      migrationDatabase = createDatabase(parseRuntimePolicy({ ...env, TEST_DATABASE_URL: migrationUrl }));
      assert.equal(await migrationDatabase.readiness(), "ready");
      const migrations = await migrationDatabase.query((client) => client.$queryRaw`
        SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
      `);
      assert.ok(migrations.length > 0);
      assert.ok(migrations.every((migration) => migration.finished_at !== null && migration.rolled_back_at === null));
    });

    // MySQL DDL commits implicitly. This fixture table belongs only to the
    // proven new datadir and is intentionally created outside a DML transaction.
    await instance.executeAdmin(`
      CREATE TABLE runtime_integration_probe (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        value INT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        probability DECIMAL(12, 9) NOT NULL,
        instant DATETIME(3) NOT NULL
      ) ENGINE=InnoDB;
      GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.runtime_integration_probe
        TO 'goal_hint_application'@'127.0.0.1';
    `);
    const { createDatabase } = await import("../src/server/database/client.ts");
    database = createDatabase(parseRuntimePolicy(env));

    await t.test("application credentials allow fixture DML but deny schema and migration-history access", async () => {
      assert.equal(await database.readiness(), "ready");
      await assert.rejects(database.query((client) => client.$executeRaw`
        CREATE TABLE forbidden_application_ddl (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(database.query((client) => client.$queryRaw`SELECT migration_name FROM _prisma_migrations`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(migrationDatabase.query((client) => client.$queryRaw`SELECT User FROM mysql.user`),
        (error) => error.name === "DatabaseOperationError");
    });

    await t.test("verification detects representable drift without repair or reset", async () => {
      await instance.assertOwnership();
      await assert.rejects(runNode([script, "verify"], env), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Schema drift detected/u);
        assert.ok(!`${error.stdout}${error.stderr}`.includes(migrationPassword));
        assert.ok(!`${error.stdout}${error.stderr}`.includes("runtime_integration_probe"));
        return true;
      });
      const tables = await instance.executeAdmin("SHOW TABLES LIKE 'runtime_integration_probe'");
      assert.equal(tables.stdout.trim(), "runtime_integration_probe");
    });

    await t.test("InnoDB commits exact values and a UTC millisecond instant", async () => {
      const instant = new Date("2026-10-07T00:00:00.123Z");
      await database.transaction(async (transaction) => {
        await transaction.$executeRaw`
          INSERT INTO runtime_integration_probe (id, value, amount, probability, instant)
          VALUES (${"committed"}, ${1}, ${"12.34"}, ${"0.123456789"}, ${instant})
        `;
        const visible = await transaction.$queryRaw`
          SELECT id FROM runtime_integration_probe WHERE id = ${"committed"}
        `;
        assert.equal(visible.length, 1);
      });
      const rows = await database.query((client) => client.$queryRaw`
        SELECT value, amount, probability, instant FROM runtime_integration_probe WHERE id = ${"committed"}
      `);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].value, 1);
      assert.equal(rows[0].amount.toString(), "12.34");
      assert.equal(rows[0].probability.toString(), "0.123456789");
      assert.equal(rows[0].instant.toISOString(), instant.toISOString());
      const engines = await migrationDatabase.query((client) => client.$queryRaw`
        SELECT ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${"runtime_integration_probe"}
      `);
      assert.equal(engines[0].ENGINE, "InnoDB");
      const sessions = await database.query((client) => client.$queryRaw`SELECT @@session.time_zone AS zone`);
      assert.ok(["+00:00", "UTC"].includes(sessions[0].zone));
    });

    await t.test("failed DML transaction leaves no writes", async () => {
      await assert.rejects(database.transaction(async (transaction) => {
        await transaction.$executeRaw`
          INSERT INTO runtime_integration_probe (id, value, amount, probability, instant)
          VALUES (${"rolled-back"}, ${2}, ${"0.00"}, ${"0.500000000"}, ${new Date("2026-10-07T00:00:00.000Z")})
        `;
        throw new Error("synthetic forced rollback");
      }), (error) => error.name === "DatabaseOperationError" && error.code === "failed"
        && !error.message.includes("synthetic forced rollback"));
      const rows = await database.query((client) => client.$queryRaw`
        SELECT id FROM runtime_integration_probe WHERE id = ${"rolled-back"}
      `);
      assert.equal(rows.length, 0);
    });

    await t.test("concurrent insert attempts resolve to one durable unique row", async () => {
      const attempts = await Promise.allSettled([1, 2].map((value) => database.transaction((transaction) => transaction.$executeRaw`
        INSERT INTO runtime_integration_probe (id, value, amount, probability, instant)
        VALUES (${"unique-owner"}, ${value}, ${"0.00"}, ${"0.500000000"}, ${new Date("2026-10-07T00:00:00.000Z")})
      `)));
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
      const rows = await database.query((client) => client.$queryRaw`
        SELECT value FROM runtime_integration_probe WHERE id = ${"unique-owner"}
      `);
      assert.equal(rows.length, 1);
      assert.ok([1, 2].includes(rows[0].value));
    });

    await t.test("the process singleton reuses a pool and supports explicit shutdown", async () => {
      const moduleUrl = new URL("../src/server/database/client.ts", import.meta.url).href;
      const source = `
        import assert from "node:assert/strict";
        import { getDatabase, disconnectDatabase } from ${JSON.stringify(moduleUrl)};
        const first = getDatabase();
        assert.equal(getDatabase(), first);
        assert.equal(await first.readiness(), "ready");
        await disconnectDatabase();
        await disconnectDatabase();
        process.stdout.write("synthetic singleton shutdown passed");
      `;
      const { stdout, stderr } = await runNode(["--input-type=module", "--eval", source], env);
      assert.equal(stdout, "synthetic singleton shutdown passed");
      assert.equal(stderr, "");
    });
  } finally {
    try {
      await Promise.all([database?.disconnect(), migrationDatabase?.disconnect()]);
    } finally {
      await instance.stop();
    }
  }
});
