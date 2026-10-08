import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = path.join(workspace, ".tmp");
const script = path.join(workspace, "scripts", "database.mjs");
const syntheticModel = "\nmodel OfflineProbe {\n  id String @id @db.VarChar(64)\n  value Int\n\n  @@map(\"offline_probe\")\n}\n";

function isolatedEnvironment(overrides = {}) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || key.startsWith("API_FOOTBALL_") || credentials.has(key)) delete env[key];
  }
  return {
    ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled",
    GOAL_HINT_DATABASE_ENABLED: "false", GOAL_HINT_FOOTBALL_ENABLED: "false",
    GOAL_HINT_AI_ENABLED: "false", GOAL_HINT_RESEARCH_ENABLED: "false", ...overrides,
  };
}

async function createFixture(t) {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await realpath(workspace);
  assert.equal(path.relative(root, await realpath(temporaryRoot)), ".tmp");
  const fixture = await mkdtemp(path.join(temporaryRoot, "database-cli-"));
  const ownership = randomUUID();
  const marker = path.join(fixture, ".goal-hint-test-owner");
  await writeFile(marker, ownership, { flag: "wx" });
  t.after(async () => {
    const actual = await realpath(fixture);
    const parent = await realpath(temporaryRoot);
    assert.equal(path.relative(root, parent), ".tmp");
    const relative = path.relative(parent, actual);
    assert.ok(relative.startsWith("database-cli-") && !relative.includes(path.sep));
    assert.equal(await readFile(marker, "utf8"), ownership);
    await rm(actual, { recursive: true, force: false, maxRetries: 3 });
  });
  await mkdir(path.join(fixture, "prisma", "migrations"), { recursive: true });
  await Promise.all([
    copyFile(path.join(workspace, "prisma.config.ts"), path.join(fixture, "prisma.config.ts")),
    copyFile(path.join(workspace, "prisma", "schema.prisma"), path.join(fixture, "prisma", "schema.prisma")),
    copyFile(path.join(workspace, "prisma", "schema.snapshot.prisma"), path.join(fixture, "prisma", "schema.snapshot.prisma")),
    writeFile(path.join(fixture, "prisma", "migrations", "migration_lock.toml"), 'provider = "mysql"\n'),
    writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true, type: "module" })),
  ]);
  return fixture;
}

function run(fixture, args, env = isolatedEnvironment()) {
  return execFileAsync(process.execPath, ["--conditions=react-server", script, ...args], {
    cwd: fixture, env, windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
}

async function observableEndpoint(t) {
  let connections = 0;
  const server = createServer((socket) => { connections += 1; socket.destroy(); });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return { port: server.address().port, connections: () => connections };
}

test("offline Prisma commands generate reviewed SQL and a snapshot without database access", { timeout: 180000 }, async (t) => {
  const fixture = await createFixture(t);
  const endpoint = await observableEndpoint(t);
  const sentinel = "synthetic-local-env-credential-sentinel";
  await writeFile(path.join(fixture, ".env.local"), [
    `DATABASE_URL=mysql://synthetic:${sentinel}@127.0.0.1:${endpoint.port}/must_not_be_loaded`,
    `MIGRATION_DATABASE_URL=mysql://synthetic:${sentinel}@127.0.0.1:${endpoint.port}/must_not_be_loaded`,
    `GOAL_HINT_SYNTHETIC_UNAPPROVED_FILE_SETTING=${sentinel}`,
  ].join("\n"));
  const offline = isolatedEnvironment({ MIGRATION_DATABASE_URL: `mysql://synthetic:${sentinel}@synthetic.invalid/offline_placeholder` });
  const generation = await run(fixture, ["generate"], offline);
  assert.equal(generation.stdout.trim(), "Database generate completed.");
  assert.equal(generation.stderr, "");
  const generatedClient = await readFile(path.join(fixture, "src", "server", "generated", "prisma", "client.ts"), "utf8");
  assert.match(generatedClient, /import "server-only";/u);
  const validation = await run(fixture, ["validate"], offline);
  assert.equal(validation.stdout.trim(), "Database validate completed.");
  const schemaFile = path.join(fixture, "prisma", "schema.prisma");
  const snapshotFile = path.join(fixture, "prisma", "schema.snapshot.prisma");
  const before = await readFile(schemaFile, "utf8");
  const changed = `${before}${syntheticModel}`;
  await writeFile(schemaFile, changed);
  const raw = await execFileAsync(process.execPath, [path.join(workspace, "node_modules", "prisma", "build", "index.js"), "migrate", "diff", "--from-schema", "prisma/schema.snapshot.prisma", "--to-schema", "prisma/schema.prisma", "--script"], {
    cwd: fixture, env: isolatedEnvironment(), windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
  t.diagnostic(JSON.stringify({ schema: await readFile(schemaFile, "utf8"), snapshot: await readFile(snapshotFile, "utf8"), stdout: raw.stdout, stderr: raw.stderr }));
  const migration = await run(fixture, ["migrate", "--name", "offline_probe"], offline);
  assert.match(migration.stdout, /Migration \d{14}_offline_probe generated; review SQL before deployment\./u);
  const directory = path.join(fixture, "prisma", "migrations");
  const created = (await readdir(directory)).filter((entry) => /^\d{14}_offline_probe$/u.test(entry));
  assert.equal(created.length, 1);
  const sql = await readFile(path.join(directory, created[0], "migration.sql"), "utf8");
  assert.match(sql, /CREATE TABLE `offline_probe`/u);
  assert.match(sql, /PRIMARY KEY \(`id`\)/u);
  assert.equal(await readFile(snapshotFile, "utf8"), changed);
  const repeated = await run(fixture, ["migrate", "--name", "offline_probe_again"], offline);
  assert.equal(repeated.stdout.trim(), "No schema changes; no migration created.");
  assert.deepEqual((await readdir(directory)).sort(), ["migration_lock.toml", created[0]].sort());
  for (const output of [generation.stdout, generation.stderr, validation.stdout, validation.stderr, migration.stdout, migration.stderr, repeated.stdout, repeated.stderr]) {
    assert.ok(!output.includes(sentinel));
  }
  assert.equal(endpoint.connections(), 0);
});

test("target commands reject missing migration credentials instead of using application credentials", async (t) => {
  const fixture = await createFixture(t);
  const endpoint = await observableEndpoint(t);
  const sentinel = "synthetic-application-fallback-password-sentinel";
  const env = isolatedEnvironment({
    GOAL_HINT_DATABASE_ENABLED: "true",
    DATABASE_URL: `mysql://synthetic:${sentinel}@127.0.0.1:${endpoint.port}/must_not_be_contacted`,
    TEST_DATABASE_URL: `mysql://synthetic:${sentinel}@127.0.0.1:${endpoint.port}/synthetic_isolated_target`,
  });
  for (const command of ["deploy", "status", "verify"]) {
    await assert.rejects(run(fixture, [command], env), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /MIGRATION_DATABASE_URL is required; application credentials are never substituted\./u);
      assert.ok(!`${error.stdout}${error.stderr}`.includes(sentinel));
      return true;
    });
  }
  assert.equal(endpoint.connections(), 0);
});

test("unsupported migration names and command arguments fail with static diagnostics", async (t) => {
  const fixture = await createFixture(t);
  const sentinel = "synthetic-argument-secret-sentinel";
  for (const args of [
    [sentinel], ["generate", "--url", sentinel], ["deploy", "--force", sentinel],
    ["migrate"], ["migrate", "--name", `../${sentinel}`], ["migrate", "--name", "UpperCase"],
  ]) {
    await assert.rejects(run(fixture, args), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Use generate, validate, migrate, deploy, status or verify\.|Only migrate accepts additional arguments|Migration generation requires --name/u);
      assert.ok(!`${error.stdout}${error.stderr}`.includes(sentinel));
      return true;
    });
  }
  assert.deepEqual(await readdir(path.join(fixture, "prisma", "migrations")), ["migration_lock.toml"]);
});
