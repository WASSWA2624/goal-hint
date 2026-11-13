import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const nextEnv = require.resolve("@next/env");
const preload = new URL("../scripts/local-next-environment.mjs", import.meta.url).href;
const settings = ["DATABASE_URL", "YOOLA_SMS_API_KEY", "GOAL_HINT_ADMIN_PASSWORD", "GOAL_HINT_OPERATION_SCOPE", "GH_LEGACY_ONLY",
  "GH_PRODUCTION_ONLY", "GH_STAGING_ONLY", "GH_WORKER_ONLY", "GH_PREVIEW_ONLY", "GH_RUNTIME_MODE"];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "goal-hint-local-env-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name, text) => writeFileSync(join(directory, name), text);
  mkdirSync(join(directory, ".goal-hint/local-environment"), { recursive: true });
  write(".env.development", "DATABASE_URL=development-db\nGOAL_HINT_ADMIN_PASSWORD='development password'\n");
  write(".env.development.local", "DATABASE_URL=other-db\nGH_LEGACY_ONLY=legacy\n");
  write(".env.production", "DATABASE_URL=production-db\nYOOLA_SMS_API_KEY=production-key\nGH_PRODUCTION_ONLY=production\nGOAL_HINT_OPERATION_SCOPE=production\n");
  write(".env.test", "GH_STAGING_ONLY=staging\n");
  write(".env.operations", "DATABASE_URL=worker-db\nGH_WORKER_ONLY=worker\n");
  write(".env.local", "GH_LEGACY_ONLY=legacy-base\n");
  write(".env", "GH_LEGACY_ONLY=legacy-global\n");
  write(".goal-hint/local-environment/production-build.env", "GH_PREVIEW_ONLY=preview\nDATABASE_URL=preview-db\n");
  const probe = join(directory, "probe.cjs");
  write("probe.cjs", `
    const {loadEnvConfig} = require(${JSON.stringify(nextEnv)});
    loadEnvConfig(process.cwd(), process.argv[2] === 'dev', {info(){}, error(){}});
    process.env.GH_RUNTIME_MODE = process.env.NODE_ENV;
    console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(settings)}.map(key => [key, process.env[key]]))));
  `);
  const source = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !settings.includes(key) && !["NODE_ENV", "NODE_OPTIONS", "__NEXT_PROCESSED_ENV", "__GOAL_HINT_OWNED_LOCAL_WEB"].includes(key)));
  const run = (args, overrides = {}) => {
    const result = spawnSync(process.execPath, [...args, probe], { cwd: directory, env: { ...source, ...overrides }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const launchWeb = (action, overrides = {}) => spawnSync(process.execPath, ["--import", preload, probe, action],
    { cwd: directory, env: { ...source, ...overrides }, encoding: "utf8" });
  const web = (action, overrides) => {
    const result = launchWeb(action, overrides);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { run, web, write, launchWeb };
}

test("normal development and its restarted Next child read only dedicated development settings", (t) => {
  const { web, write } = fixture(t);
  const initial = web("dev");
  assert.equal(initial.DATABASE_URL, "development-db");
  assert.equal(initial.GOAL_HINT_ADMIN_PASSWORD, "development password");
  assert.equal(initial.GH_LEGACY_ONLY, "");
  assert.equal(initial.GH_PRODUCTION_ONLY, undefined);
  assert.equal(initial.GH_STAGING_ONLY, undefined);
  assert.equal(initial.GH_WORKER_ONLY, undefined);
  assert.equal(initial.GH_RUNTIME_MODE, "development");

  write(".env.development", "DATABASE_URL=changed-dev-db\n");
  assert.equal(web("dev").DATABASE_URL, "changed-dev-db");
  assert.equal(web("dev", { DATABASE_URL: "explicit-process-db" }).DATABASE_URL, "explicit-process-db");

  const owned = web("dev", { __GOAL_HINT_OWNED_LOCAL_WEB: "1", DATABASE_URL: "owned-db" });
  assert.equal(owned.DATABASE_URL, "owned-db");
  assert.equal(owned.GH_LEGACY_ONLY, "");

  const worker = web("start-server-worker", { NODE_ENV: "development", __GOAL_HINT_OWNED_LOCAL_WEB: "1", DATABASE_URL: "owned-db" });
  assert.equal(worker.GH_RUNTIME_MODE, "development");
  assert.equal(worker.DATABASE_URL, "owned-db");
  assert.equal(worker.GH_PREVIEW_ONLY, undefined);
});

test("local production Next build and start take their local overlay and block implicit hosted settings", (t) => {
  const { web } = fixture(t);
  for (const action of ["build", "start"]) {
    const result = web(action, { NODE_ENV: "development" });
    assert.equal(result.DATABASE_URL, "preview-db");
    assert.equal(result.GOAL_HINT_ADMIN_PASSWORD, "development password");
    assert.equal(result.GH_PREVIEW_ONLY, "preview");
    assert.equal(result.GH_PRODUCTION_ONLY, "");
    assert.equal(result.YOOLA_SMS_API_KEY, "");
    assert.equal(result.GOAL_HINT_OPERATION_SCOPE, "");
    assert.equal(result.GH_STAGING_ONLY, undefined);
    assert.equal(result.GH_WORKER_ONLY, undefined);
    assert.equal(result.GH_RUNTIME_MODE, "production");
  }
});

test("the worker's explicit operations overlay keeps its existing priority", (t) => {
  const { run } = fixture(t);
  const worker = run(["--env-file=.env.development", "--env-file=.env.operations"], { NODE_ENV: "development" });
  assert.equal(worker.DATABASE_URL, "worker-db");
  assert.equal(worker.GH_WORKER_ONLY, "worker");
});

test("local standalone output cannot copy the private hosted profile into its build", (t) => {
  const { launchWeb } = fixture(t);
  const result = launchWeb("build", { BUILD_OUTPUT: "standalone" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm run package:cpanel/);
  assert.doesNotMatch(result.stderr, /production-key/);
});
