import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { link, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { archiveEvaluationReadiness, archiveEvaluationReport, EvaluationArchiveError, parseEvaluationJson, readEvaluationFile } from "../src/server/evaluation/evaluation-archive.ts";
import { runEvaluationCommand } from "../src/server/evaluation/evaluation-command.ts";
import { parseEvaluationDataset } from "../src/server/evaluation/evaluation-input.ts";
import { createEvaluationHarness } from "../src/server/evaluation/evaluation-service.ts";
import { evaluationAuthority, evaluationDataset, evaluationProtocol } from "./helpers/evaluation-fixtures.mjs";

// All data and authority modules here are synthetic local fixtures; no provider or database is used.
const execFileAsync = promisify(execFile);
const command = fileURLToPath(new URL("../scripts/forecast-evaluation.mjs", import.meta.url));
async function directory(t) {
  const value = await mkdtemp(path.join(os.tmpdir(), "goal-hint-evaluation-archive-"));
  t.after(() => rm(value, { recursive: true, force: true })); return value;
}
function artifact(dataset = evaluationDataset(), protocol = evaluationProtocol(), authority = evaluationAuthority()) {
  const report = createEvaluationHarness({ authority, maxRows: 1000, maxBytes: 67_108_864 }).evaluate({ protocol, dataset, split: "finalTest" });
  return { protocol, dataset, report };
}
const rejects = (operation, reason) => assert.rejects(operation, (error) => error instanceof EvaluationArchiveError && error.reason === reason);

test("an immutable bundle preserves the exact validated protocol, native integer dataset and report on rerun", async (t) => {
  const root = await directory(t), value = artifact(), first = await archiveEvaluationReport({ directory: root, ...value });
  assert.equal(first.fromCache, false);
  assert.deepEqual(JSON.parse(await readFile(first.reportPath, "utf8")), value.report);
  assert.deepEqual(parseEvaluationDataset(parseEvaluationJson(await readFile(first.datasetPath, "utf8"), "dataset")), value.dataset);
  assert.deepEqual(JSON.parse(await readFile(first.protocolPath, "utf8")), value.protocol);
  const original = await readFile(first.markdownPath, "utf8"), second = await archiveEvaluationReport({ directory: root, ...value });
  assert.equal(second.fromCache, true); assert.equal(second.id, first.id); assert.equal(await readFile(first.markdownPath, "utf8"), original);
  assert.deepEqual((await readdir(first.directory)).sort(), ["dataset.json", "protocol.json", "report.json", "report.md"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, `final-test-${value.protocol.id}.json`), "utf8")), { datasetId: value.dataset.id,
    protocolId: value.protocol.id, reportId: value.report.id, selectionVersion: value.protocol.selectionVersion, version: 1 });
});
test("the first independent final-test dataset and report cannot be silently replaced", async (t) => {
  const root = await directory(t), first = artifact(), archived = await archiveEvaluationReport({ directory: root, ...first });
  const changed = artifact(evaluationDataset({ evidenceRef: "synthetic-second-dataset-version" }), first.protocol);
  await rejects(archiveEvaluationReport({ directory: root, ...changed }), "artifact-conflict");
  assert.deepEqual(JSON.parse(await readFile(archived.reportPath, "utf8")), first.report);
  assert.equal((await readdir(root)).includes(changed.report.id), false);
});
test("mismatched hashes, protocol bindings and bounds fail before an artifact is created", async (t) => {
  const root = await directory(t), value = artifact();
  await rejects(archiveEvaluationReport({ directory: root, ...value, report: { ...value.report, selectedRows: 9 } }), "invalid-artifact");
  await rejects(archiveEvaluationReport({ directory: root, ...value, protocol: evaluationProtocol({ name: "synthetic-different" }) }), "invalid-artifact");
  await rejects(archiveEvaluationReport({ directory: root, ...value, maxBytes: 100 }), "invalid-artifact");
  assert.deepEqual(await readdir(root), []);
});
test("copied or rehashed invented metric results cannot be pinned as a trusted final report", async (t) => {
  const root = await directory(t), value = artifact();
  await rejects(archiveEvaluationReport({ directory: root, ...value, report: { ...value.report } }), "invalid-artifact");
  const { id: _id, hash: _hash, ...body } = value.report;
  void _id; void _hash;
  const invented = { ...body, cells: body.cells.map((cell, index) => index === 0 ? { ...cell, metrics: { ...cell.metrics, brier: 0 } } : cell) };
  const inventedId = evidenceFingerprint(invented);
  await rejects(archiveEvaluationReport({ directory: root, ...value, report: { ...invented, id: inventedId, hash: inventedId } }), "invalid-artifact");
  assert.deepEqual(await readdir(root), []);
  const genuine = await archiveEvaluationReport({ directory: root, ...value });
  assert.equal(genuine.id, value.report.id);
});
test("authority revoked after evaluation prevents the original report from being archived", async (t) => {
  const root = await directory(t);
  let permitted = true;
  const authority = evaluationAuthority({ authorize() { if (!permitted) throw new Error("synthetic-private-revocation-reason"); } });
  const value = artifact(evaluationDataset(), evaluationProtocol(), authority); permitted = false;
  await rejects(archiveEvaluationReport({ directory: root, ...value }), "invalid-artifact");
  assert.deepEqual(await readdir(root), []);
});
test("a modified existing bundle stays modified and is rejected rather than overwritten", async (t) => {
  const root = await directory(t), value = artifact(), archived = await archiveEvaluationReport({ directory: root, ...value });
  await writeFile(archived.reportPath, "synthetic-corrupt-prior-report", "utf8");
  await rejects(archiveEvaluationReport({ directory: root, ...value }), "artifact-conflict");
  assert.equal(await readFile(archived.reportPath, "utf8"), "synthetic-corrupt-prior-report");
});
test("traversal, linked directories and hard-linked input files cannot enter an archive", async (t) => {
  const root = await directory(t);
  await rejects(archiveEvaluationReadiness({ directory: `${root}${path.sep}..${path.sep}unapproved-target` }), "unsafe-path");
  const target = path.join(root, "target"); await archiveEvaluationReadiness({ directory: target });
  const alias = path.join(root, "linked-directory"); await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
  await rejects(archiveEvaluationReadiness({ directory: alias }), "unsafe-path");
  await rejects(readEvaluationFile(path.join(alias, "forecast-evaluation-readiness.json")), "unsafe-path");
  const original = path.join(root, "original.json"), linked = path.join(root, "hard-linked.json");
  await writeFile(original, "{}", "utf8"); await link(original, linked);
  await rejects(readEvaluationFile(linked), "invalid-file");
});
test("JSON restores only bounded fixtureVersion integers and leaves arbitrary wrapper fields untouched", () => {
  const dataset = evaluationDataset(), decoded = parseEvaluationJson(evidenceSerialize(dataset), "dataset");
  assert.equal(typeof decoded.fixtures[0].context.fixtureVersion, "bigint"); assert.deepEqual(parseEvaluationDataset(decoded), dataset);
  const decimal = JSON.parse(evidenceSerialize(dataset)); decimal.fixtures[0].context.fixtureVersion = "18446744073709551615";
  assert.equal(parseEvaluationJson(JSON.stringify(decimal), "dataset").fixtures[0].context.fixtureVersion, 18_446_744_073_709_551_615n);
  for (const invalid of ["18446744073709551616", "0", "-1", "1e3", "0001", "9".repeat(1000)]) {
    decimal.fixtures[0].context.fixtureVersion = invalid;
    assert.throws(() => parseEvaluationJson(JSON.stringify(decimal), "dataset"), EvaluationArchiveError);
  }
  const foreign = parseEvaluationJson('{"arbitrary":{"$evidenceInteger":"123"}}', "dataset");
  assert.deepEqual(foreign, { arbitrary: { $evidenceInteger: "123" } });
  assert.throws(() => parseEvaluationJson("not-json-synthetic-private-value", "dataset"), (error) => !error.message.includes("synthetic-private-value"));
  assert.throws(() => parseEvaluationJson("{}", "dataset", 1));
});
test("readiness generation is deterministic, leaves zero real evidence and refuses replacement", async (t) => {
  const root = await directory(t), first = await runEvaluationCommand(["--directory", root]), second = await runEvaluationCommand(["--directory", root]);
  assert.equal(first.kind, "readiness"); assert.equal(second.fromCache, true); assert.deepEqual(first.report, second.report);
  assert.equal(first.report.actualForecastObservations, 0); assert.equal(first.report.dispatchedLiveRequests, 0);
  await writeFile(first.markdownPath, "synthetic-existing-report", "utf8");
  await rejects(archiveEvaluationReadiness({ directory: root }), "artifact-conflict");
  assert.equal(await readFile(first.markdownPath, "utf8"), "synthetic-existing-report");
});
test("the thin CLI stays offline for readiness and redacts invalid synthetic input and verifier errors", async (t) => {
  const root = await directory(t), env = { ...process.env, API_FOOTBALL_KEY: "synthetic-private-cli-secret", GOAL_HINT_FOOTBALL_ENABLED: "synthetic-invalid-setting" };
  const outcome = await execFileAsync(process.execPath, ["--conditions=react-server", command, "--directory", root], { env });
  assert.match(outcome.stdout, /readiness/u); assert.equal((outcome.stdout + outcome.stderr).includes("synthetic-private-cli-secret"), false);
  const invalidArguments = [["--secret", "synthetic-private-cli-secret"], ["--directory", root, "--directory", root], ["--protocol", "synthetic-private-cli-secret"], ["--split", "finalTest"]];
  for (const args of invalidArguments) await assert.rejects(execFileAsync(process.execPath, ["--conditions=react-server", command, ...args], { env }), (error) => {
    assert.equal(error.code, 1); assert.equal((error.stdout + error.stderr).includes("synthetic-private-cli-secret"), false); return true;
  });
});
test("the CLI evaluates explicit frozen local data only with an independently supplied verifier module", async (t) => {
  const root = await directory(t), value = artifact(), protocolPath = path.join(root, "protocol-input.json"), datasetPath = path.join(root, "dataset-input.json"), authorityPath = path.join(root, "trusted-synthetic.mjs");
  await writeFile(protocolPath, evidenceSerialize(value.protocol), "utf8"); await writeFile(datasetPath, evidenceSerialize(value.dataset), "utf8");
  await writeFile(authorityPath, 'export const authority = {authorize(){},verifyProtocol:()=>true,verifyDataset:()=>true,verifyForecast:()=>true,verifyEvidence:()=>true,verifyResult:()=>true,verifyHistory:()=>true,verifyModel:()=>true,verifyUntouchedFinalTest:()=>true};', "utf8");
  const outputDirectory = path.join(root, "archive"), args = ["--protocol", protocolPath, "--dataset", datasetPath, "--authority", authorityPath, "--split", "finalTest", "--directory", outputDirectory];
  const first = await runEvaluationCommand(args); assert.equal(first.kind, "evaluation"); assert.equal(first.report.id, value.report.id); assert.ok(first.report.gates.every((gate) => gate.status === "pending"));
  const repeated = await execFileAsync(process.execPath, ["--conditions=react-server", command, ...args]); assert.match(repeated.stdout, /evaluation/u);
  const badAuthority = path.join(root, "bad-synthetic.mjs"); await writeFile(badAuthority, 'throw new Error("synthetic-private-verifier-secret");', "utf8");
  const badArgs = args.map((entry) => entry === authorityPath ? badAuthority : entry);
  await assert.rejects(execFileAsync(process.execPath, ["--conditions=react-server", command, ...badArgs]), (error) => {
    assert.equal(error.code, 1); assert.equal((error.stdout + error.stderr).includes("synthetic-private-verifier-secret"), false); return true;
  });
});
