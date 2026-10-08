import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createMysqlModelVersionStore, ModelStorageError } from "../src/server/predictor/predictor-mysql-store.ts";
import { createModelRegistry } from "../src/server/predictor/predictor-registry.ts";
import { modelAuthority, modelConfiguration, modelVersion, predictorHash } from "./helpers/predictor-fixtures.mjs";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));
const denied = (reason) => (error) => error instanceof ModelStorageError && error.reason === reason && !error.message.includes("private-synthetic-key");
function isolatedEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  return { ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct",
    GOAL_HINT_DATABASE_POOL_LIMIT: "4", GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "10000" };
}

test("immutable predictor model registry on isolated genuine MySQL", { timeout: 300000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed model registry acceptance remains pending.`); return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. All model and evaluation configurations are synthetic; no AI provider request is made.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex"), applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://predictor_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://predictor_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = isolatedEnvironment(applicationUrl, migrationUrl), databases = [];
  function replica() { const database = createDatabase(parseRuntimePolicy(env)); databases.push(database); return database; }
  try {
    await instance.executeAdmin(`
      CREATE USER 'predictor_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'predictor_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON goal_hint_test.* TO 'predictor_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"],
      { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
    await instance.executeAdmin("GRANT SELECT, INSERT ON goal_hint_test.ModelVersion TO 'predictor_application'@'127.0.0.1';");
    const firstDatabase = replica(), secondDatabase = replica();
    const first = createMysqlModelVersionStore(firstDatabase), second = createMysqlModelVersionStore(secondDatabase), authority = modelAuthority();
    let persisted;
    await t.test("all migrations deploy on InnoDB and schema matches without application DDL or migration access", async () => {
      const rows = await firstDatabase.query((client) => client.$queryRaw`SELECT ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ModelVersion'`);
      assert.equal(rows[0].ENGINE, "InnoDB");
      await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "verify"],
        { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`CREATE TABLE forbidden_predictor_ddl (id INT PRIMARY KEY)`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$queryRaw`SELECT migration_name FROM _prisma_migrations`),
        (error) => error.name === "DatabaseOperationError");
    });
    await t.test("independent clients share an immutable exact model configuration", async () => {
      const model = modelVersion(); persisted = await first.save(model, authority);
      assert.deepEqual(persisted, model); assert.deepEqual(await second.find(model.id), model);
      assert.equal((await firstDatabase.query((client) => client.$queryRaw`SELECT COUNT(*) AS count FROM ModelVersion`))[0].count, 1n);
    });
    await t.test("repeat and concurrent identical saves are idempotent with SELECT and INSERT grants", async () => {
      assert.deepEqual(await first.save(persisted, authority), persisted);
      const model = modelVersion({ promptVersion: "synthetic-concurrent-prompt-v1" });
      const results = await Promise.all([first.save(model, authority), second.save(model, authority)]);
      assert.deepEqual(results, [model, model]);
      const rows = await firstDatabase.query((client) => client.$queryRaw`SELECT COUNT(*) AS count FROM ModelVersion WHERE id = ${model.id}`);
      assert.equal(rows[0].count, 1n);
    });
    await t.test("old immutable versions remain after independently registering a newer exact provider model", async () => {
      const newer = modelVersion({ providerModelVersion: "synthetic-model-2026-01-02" });
      await first.save(newer, authority);
      assert.notEqual(newer.id, persisted.id); assert.deepEqual(await second.find(persisted.id), persisted);
      assert.deepEqual(await second.find(newer.id), newer);
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`UPDATE ModelVersion SET model = 'changed-model' WHERE id = ${persisted.id}`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`DELETE FROM ModelVersion WHERE id = ${persisted.id}`),
        (error) => error.name === "DatabaseOperationError");
    });
    await t.test("applicable chronological training, validation, calibration and final test windows retain original milliseconds", async () => {
      const model = modelVersion({ windows: { training: { startsAt: 0, endsAt: 1001 }, validation: { startsAt: 1001, endsAt: 2002 },
        calibration: { startsAt: 2002, endsAt: 3003 }, finalTest: { startsAt: 3003, endsAt: 4004 } } });
      await first.save(model, authority); assert.deepEqual(await second.find(model.id), model);
    });
    await t.test("evaluated calibration artifacts stay explicit and never become quality approval merely through persistence", async () => {
      const model = modelVersion({ windows: { calibration: { startsAt: 2002, endsAt: 3003 } },
        calibration: { kind: "evaluated", version: "synthetic-cal-v1", method: "synthetic-calibration-method", parameters: { alpha: 1 },
          sourceFamilies: ["match-result"], evidenceRef: "synthetic-calibration-proof", evaluationRef: "synthetic-evaluation-artifact" } });
      await first.save(model, authority); const stored = await second.find(model.id);
      assert.deepEqual(stored, model); assert.equal(stored.evaluation.status, "provisional");
      await assert.rejects(first.save(model, modelAuthority({ verifyCalibration: () => false })), denied("not-authorized"));
    });
    await t.test("authority revocation during a save rolls back its new model row", async () => {
      const model = modelVersion({ promptVersion: "synthetic-revoked-prompt-v1" }); let checks = 0;
      await assert.rejects(first.save(model, modelAuthority({ verifyModel: () => ++checks < 3 })), denied("not-authorized"));
      assert.equal(await second.find(model.id), null);
    });
    await t.test("invalid hashes and model configurations are refused before database mutation", async () => {
      await assert.rejects(first.save({ ...persisted, model: "private-synthetic-key" }, authority), denied("invalid-request"));
      await assert.rejects(first.find("private-synthetic-key"), denied("invalid-request"));
      assert.deepEqual(await second.find(persisted.id), persisted);
    });
    await t.test("native constraints reject projection mismatch and malformed chronology", async () => {
      await assert.rejects(instance.executeAdmin(`UPDATE ModelVersion SET provider = 'forged-provider' WHERE id = '${persisted.id}'`));
      await assert.rejects(instance.executeAdmin(`UPDATE ModelVersion SET trainingStartsAt = '2026-01-02 00:00:00.000', trainingEndsAt = '2026-01-01 00:00:00.000' WHERE id = '${persisted.id}'`));
      await assert.rejects(instance.executeAdmin(`UPDATE ModelVersion SET integrity = REPEAT('0', 64) WHERE id = '${persisted.id}'`));
      assert.deepEqual(await second.find(persisted.id), persisted);
    });
    await t.test("restored owning-job pins bind retries to the original archived version", async () => {
      const registry = createModelRegistry({ store: first, authority, maxPins: 20 });
      const model = await registry.register(modelConfiguration({ promptVersion: "synthetic-pinned-prompt-v1" }));
      const pin = await registry.pin({ invocationId: predictorHash("mysql-invocation"), jobId: predictorHash("mysql-job"), modelVersionId: model.id });
      const restored = createModelRegistry({ store: second, authority, maxPins: 20, verifyPriorPin: (previous) => previous.id === pin.id });
      assert.equal((await restored.resolve(pin)).model.id, model.id);
      await assert.rejects(restored.pin({ invocationId: predictorHash("mysql-retry"), jobId: pin.jobId, modelVersionId: persisted.id }),
        (error) => error.reason === "conflicting-pin");
    });
    await t.test("a sealed but malformed archived payload still fails strict application hash and input checks", async () => {
      const model = modelVersion({ promptVersion: "synthetic-corruption-prompt-v1" }); await first.save(model, authority);
      const mutation = "JSON_SET(configurationJson, '$.contractEvidenceRef', '')";
      await instance.executeAdmin(`UPDATE ModelVersion SET configurationJson = ${mutation}, integrity = SHA2(CONCAT(id, ':', CAST(configurationJson AS CHAR)), 256) WHERE id = '${model.id}'`);
      await assert.rejects(second.find(model.id), denied("invalid-state"));
      await assert.rejects(first.save(model, authority), denied("invalid-state"));
    });
  } finally {
    await Promise.all(databases.map((database) => database.disconnect().catch(() => {})));
    await instance.stop();
  }
});
