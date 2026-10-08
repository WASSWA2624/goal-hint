import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { executeTrialCommand } from "../src/server/football/provider-trial-command.ts";
import { createOfflineTrialPlan, parseTrialPlan } from "../src/server/football/provider-trial-input.ts";

// All records and clocks in these tests are synthetic; no provider account is used.
const now = Date.parse("2026-10-08T21:00:00Z");
const clock = { now: () => now };
const execFileAsync = promisify(execFile);
const command = fileURLToPath(new URL("../scripts/football-provider-trial.mjs", import.meta.url));
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goal-hint-trial-command-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test("offline command generates reproducible JSON and Markdown with all live requirements untested", async (t) => {
  const directory = await fixture(t);
  const first = await executeTrialCommand({ action: "init", directory, clock });
  assert.equal(first.reason, "offline");
  assert.equal(first.report.liveSuitability, "incomplete");
  assert.equal(first.report.budget.allowance, null);
  assert.equal(first.report.budget.chargedRequests, 0);
  assert.equal(first.report.findings.length, 34);
  assert.ok(first.report.findings.every((finding) => finding.status === "untested"));
  assert.deepEqual(JSON.parse(await readFile(first.jsonFile, "utf8")), first.report);
  const markdown = await readFile(first.reportFile, "utf8");
  assert.match(markdown, /Live operations: blocked/u);
  const resumed = await executeTrialCommand({ action: "report", directory, clock });
  assert.deepEqual(resumed.report, first.report);
  assert.deepEqual((await readdir(directory)).sort(), ["provider-trial-journal.json", "provider-trial-report.json", "provider-trial-report.md"]);
});
test("a run without trusted live authority produces an incomplete report without any attempted request", async (t) => {
  const directory = await fixture(t);
  const outcome = await executeTrialCommand({ action: "run", directory, clock });
  assert.equal(outcome.reason, "blocked");
  assert.equal(outcome.report.liveSuitability, "incomplete");
  assert.equal(outcome.report.budget.knownDispatchedRequests, 0);
  const journal = JSON.parse(await readFile(path.join(directory, "provider-trial-journal.json"), "utf8"));
  assert.deepEqual(journal.tasks, []);
});
test("a corrupt existing journal cannot be replaced with a fresh trial or reset its allowance", async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, "provider-trial-journal.json"), "invalid synthetic journal", "utf8");
  await assert.rejects(executeTrialCommand({ action: "report", directory, clock }), /invalid-file/u);
  assert.equal(await readFile(path.join(directory, "provider-trial-journal.json"), "utf8"), "invalid synthetic journal");
});
test("plan parsing rejects credentials, conflicting IDs, invalid dates and out-of-scope historical queries", () => {
  const baseline = createOfflineTrialPlan();
  for (const plan of [
    { ...baseline, apiKey: "synthetic-private-value" },
    { ...baseline, competitions: [{ id: 39, season: 2026 }, { id: 39, season: 2026 }] },
    { ...baseline, tasks: [{ id: "date", case: "league", maxRequests: 1, operation: { kind: "fixtures", query: { date: "2026-02-30" } } }] },
    { ...baseline, tasks: [{ id: "teams", case: "identity", maxRequests: 1, operation: { kind: "teams", query: { competitionId: 39, season: 2026 } } }] },
    { ...baseline, evidence: [{ id: "private", requirement: "private-use-rights", kind: "synthetic", source: "synthetic-record", recordedAt: now, value: { apiKey: "synthetic-value" } }] },
    { ...baseline, evidence: [{ id: "private", requirement: "private-use-rights", kind: "synthetic", source: "https://synthetic.example/?key=synthetic", recordedAt: now, value: {} }] },
  ]) assert.throws(() => parseTrialPlan(plan), /Private input values are withheld/u);
  assert.equal(Object.isFrozen(baseline), true);
});
test("a changed plan file cannot reset an initialized command journal", async (t) => {
  const directory = await fixture(t);
  const planFile = path.join(directory, "plan.json");
  await writeFile(planFile, JSON.stringify(createOfflineTrialPlan("synthetic-plan-A")), "utf8");
  await executeTrialCommand({ action: "init", directory, planFile, clock });
  await writeFile(planFile, JSON.stringify(createOfflineTrialPlan("synthetic-plan-B")), "utf8");
  await assert.rejects(executeTrialCommand({ action: "report", directory, planFile, clock }), /plan-changed/u);
});
test("CLI offline mode does not parse paid policy or leak malformed synthetic secret settings", async (t) => {
  const directory = await fixture(t);
  const env = { ...process.env, API_FOOTBALL_KEY: "synthetic-cli-private-value", GOAL_HINT_FOOTBALL_ENABLED: "invalid-synthetic-boolean" };
  const result = await execFileAsync(process.execPath, ["--conditions=react-server", command, "report", "--directory", directory], { env });
  assert.match(result.stdout, /Suitability: incomplete/u);
  assert.equal((result.stdout + result.stderr).includes("synthetic-cli-private-value"), false);
  assert.equal(JSON.parse(await readFile(path.join(directory, "provider-trial-report.json"), "utf8")).budget.knownDispatchedRequests, 0);
});
test("CLI rejects duplicate/unknown flags and blocked live execution has a distinct exit code", async (t) => {
  const directory = await fixture(t);
  for (const args of [["report", "--key", "synthetic-secret"], ["report", "--directory", directory, "--directory", directory]]) {
    await assert.rejects(execFileAsync(process.execPath, ["--conditions=react-server", command, ...args]), (error) => {
      assert.equal(error.code, 1);
      assert.equal((error.stdout + error.stderr).includes("synthetic-secret"), false);
      return true;
    });
  }
  await assert.rejects(execFileAsync(process.execPath, ["--conditions=react-server", command, "run", "--directory", directory]), (error) => {
    assert.equal(error.code, 2);
    assert.match(error.stdout, /Provider trial: blocked/u);
    return true;
  });
});
