import assert from "node:assert/strict";
import test from "node:test";
import { parseEnv } from "node:util";
import { applyConfig, localChanges, patchSettings } from "../scripts/sync-hosted-env.mjs";

const staging = "GOAL_HINT_DEPLOYMENT_ENVIRONMENT=staging\n";
const production = "GOAL_HINT_DEPLOYMENT_ENVIRONMENT=production\n";

test("only explicitly selected nonblank keys are set and clearing is explicit", () => {
  const local = staging + "YOOLA_SMS_API_KEY='synthetic-token'\nYOOLA_SMS_SENDER= # blank\nDATABASE_URL=mysql://ignored\n";
  const changes = localChanges(local, "staging", ["YOOLA_SMS_API_KEY", "YOOLA_SMS_SENDER"], ["GOAL_HINT_ADMIN_PHONES"]);
  assert.deepEqual(changes, [
    { key: "YOOLA_SMS_API_KEY", action: "set", value: "synthetic-token" },
    { key: "YOOLA_SMS_SENDER", action: "skip" },
    { key: "GOAL_HINT_ADMIN_PHONES", action: "clear" },
  ]);
  const hosted = staging + "YOOLA_SMS_SENDER=Existing\nGOAL_HINT_ADMIN_PHONES='[]'\n";
  const { updated, summary } = patchSettings(hosted, changes);
  assert.deepEqual(parseEnv(updated), { GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "staging", YOOLA_SMS_SENDER: "Existing", YOOLA_SMS_API_KEY: "synthetic-token" });
  assert.deepEqual(summary, ["YOOLA_SMS_API_KEY: add", "YOOLA_SMS_SENDER: skipped (blank or absent locally)", "GOAL_HINT_ADMIN_PHONES: clear"]);
});

test("hosted changes preserve other assignments and multiline unknown values byte for byte", () => {
  const before = "# private hosted file\r\nDATABASE_URL=synthetic\r\nexport UNKNOWN='line one\r\nYOOLA_SMS_API_KEY=inside quote\r\nline three'\r\n";
  const after = "UNKNOWN_OTHER= retained # keep this comment\r\nGOAL_HINT_FOOTBALL_ENABLED=false\r\n";
  const hosted = before + "export YOOLA_SMS_API_KEY = 'previous-key' # old\r\n" + after;
  const { updated, summary } = patchSettings(hosted, [{ key: "YOOLA_SMS_API_KEY", action: "set", value: "synthetic-key" }]);
  assert.equal(updated, before + "YOOLA_SMS_API_KEY='synthetic-key'\r\n" + after);
  assert.deepEqual(summary, ["YOOLA_SMS_API_KEY: update"]);
  assert.equal(parseEnv(updated).UNKNOWN, parseEnv(hosted).UNKNOWN);
  assert.equal(patchSettings(updated, [{ key: "YOOLA_SMS_API_KEY", action: "set", value: "synthetic-key" }]).updated, updated);
});

test("same values, absent clears and local blank values do not rewrite hosted files", () => {
  const hosted = "YOOLA_SMS_API_KEY=old\nYOOLA_SMS_SENDER=Existing";
  const changes = [
    { key: "YOOLA_SMS_API_KEY", action: "set", value: "old" },
    { key: "YOOLA_SMS_SENDER", action: "skip" },
    { key: "GOAL_HINT_ADMIN_PHONES", action: "clear" },
  ];
  assert.deepEqual(patchSettings(hosted, changes), {
    updated: hosted,
    summary: ["YOOLA_SMS_API_KEY: unchanged", "YOOLA_SMS_SENDER: skipped (blank or absent locally)", "GOAL_HINT_ADMIN_PHONES: unchanged"],
  });
});

test("invalid target, sensitive policy keys, duplicates and live payment keys are refused without values", () => {
  assert.throws(() => localChanges(staging, "production", ["YOOLA_SMS_SENDER"], []), /does not identify production/u);
  for (const key of ["DATABASE_URL", "GOAL_HINT_OPERATION_SCOPE", "GOAL_HINT_BUDGET_APPROVAL_REF", "API_FOOTBALL_KEY", "UNKNOWN_KEY"]) {
    assert.throws(() => localChanges(staging, "staging", [key], []), /cannot be changed/u);
  }
  assert.throws(() => localChanges(production, "production", ["GOAL_HINT_FLUTTERWAVE_SECRET_KEY"], []), /cannot be changed/u);
  assert.throws(() => localChanges(staging + "GOAL_HINT_FLUTTERWAVE_SECRET_KEY=synthetic-live\n", "staging", ["GOAL_HINT_FLUTTERWAVE_SECRET_KEY"], []),
    (error) => error.message === "GOAL_HINT_FLUTTERWAVE_SECRET_KEY has an invalid value.");
  assert.throws(() => localChanges(staging, "staging", ["YOOLA_SMS_SENDER"], ["YOOLA_SMS_SENDER"]), /only once/u);
  assert.throws(() => localChanges(staging + "YOOLA_SMS_SENDER=One\nYOOLA_SMS_SENDER=Two\n", "staging", ["YOOLA_SMS_SENDER"], []), /more than once/u);
  assert.throws(() => patchSettings("YOOLA_SMS_SENDER=One\nYOOLA_SMS_SENDER=Two\n", [{ key: "YOOLA_SMS_SENDER", action: "clear" }]), /more than once/u);
  assert.throws(() => localChanges(staging, "staging", [], ["GOAL_HINT_ANALYTICS_SECRET"]), /cannot be cleared/u);
});

test("the actual Node dotenv parse protects an unselected value from an ambiguous assignment", () => {
  const hosted = "UNSELECTED= \nYOOLA_SMS_SENDER=Existing\n";
  assert.throws(() => patchSettings(hosted, [{ key: "YOOLA_SMS_SENDER", action: "clear" }]), /unsupported assignment|alter another/u);
});

test("shared administrator sync accepts the password and preserves retired hash settings", () => {
  const old = "GOAL_HINT_ADMIN_PASSWORD_HASH=retired-hash\nGOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH=legacy-analytics-hash\n";
  const text = production + old + "GOAL_HINT_ADMIN_PASSWORD='synthetic admin password'\n";
  const changes = localChanges(text, "production", ["GOAL_HINT_ADMIN_PASSWORD"], []);
  const { updated } = patchSettings(production + old, changes);
  assert.equal(updated, text);
  for (const key of ["GOAL_HINT_ADMIN_PASSWORD_HASH", "GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH"]) {
    assert.throws(() => localChanges(text, "production", [key], []), /cannot be changed/u);
    assert.throws(() => localChanges(text, "production", [], [key]), /cannot be changed/u);
  }
});

test("analytics retention accepts canonical whole days only", () => {
  const key = "GOAL_HINT_ANALYTICS_RETENTION_DAYS";
  const select = (value) => localChanges(production + `${key}=${value}\n`, "production", [key], []);
  for (const value of ["1", "395", "1095"]) assert.equal(select(value)[0].value, value);
  for (const value of ["0001", "0", "1096", "1.0", "-1"]) {
    assert.throws(() => select(value), (error) => error.message === `${key} has an invalid value.`);
  }
});

function transaction({ healthy = () => true, failWrite } = {}) {
  const paths = ["canonical", "effective"];
  const originals = ["canonical-original", "effective-original"];
  const files = new Map(paths.map((path, index) => [path, originals[index]]));
  const calls = [];
  const args = {
    paths, originals, updated: "changed",
    verify: () => calls.push("verify"),
    backup: () => { calls.push("backup"); return "/private/backup"; },
    write: (path, value) => {
      calls.push(`write ${path} ${value}`);
      if (failWrite?.(path, value)) throw new Error("private write failure");
      files.set(path, value);
    },
    restart: () => calls.push("restart"),
    smoke: (restarted) => { calls.push(restarted ? "smoke after restart" : "smoke before changes"); return healthy(restarted); },
  };
  return { files, calls, args };
}

test("apply requires a healthy baseline and makes both private backups before any write", () => {
  const unhealthy = transaction({ healthy: () => false });
  assert.throws(() => applyConfig(unhealthy.args), /before changes/u);
  assert.deepEqual(unhealthy.calls, ["verify", "smoke before changes"]);

  const healthy = transaction();
  assert.equal(applyConfig(healthy.args), "/private/backup");
  assert.deepEqual(healthy.calls, ["verify", "smoke before changes", "verify", "backup", "write canonical changed", "write effective changed", "restart", "smoke after restart"]);
  assert.deepEqual([...healthy.files.values()], ["changed", "changed"]);
});

test("smoke and partial write failures restore both originals and restart again", () => {
  let restarted = 0;
  const unhealthy = transaction({ healthy: (after) => !after || ++restarted > 1 });
  assert.throws(() => applyConfig(unhealthy.args), /Both settings files were restored and HTTPS recovered/u);
  assert.deepEqual([...unhealthy.files.values()], unhealthy.args.originals);
  assert.deepEqual(unhealthy.calls.slice(-4), ["write canonical canonical-original", "write effective effective-original", "restart", "smoke after restart"]);

  const partial = transaction({ failWrite: (path, value) => path === "effective" && value === "changed" });
  assert.throws(() => applyConfig(partial.args), /Both settings files were restored/u);
  assert.deepEqual([...partial.files.values()], partial.args.originals);
});

test("rollback attempts both originals and retains the private backup path if recovery fails", () => {
  const failed = transaction({
    healthy: (after) => !after,
    failWrite: (path, value) => path === "canonical" && value === "canonical-original",
  });
  assert.throws(() => applyConfig(failed.args), (error) =>
    error.message === "Config sync failed and recovery needs attention. Private backup: /private/backup");
  assert.deepEqual([...failed.files.values()], ["changed", "effective-original"]);
  assert.deepEqual(failed.calls.slice(-2), ["write canonical canonical-original", "write effective effective-original"]);
});
