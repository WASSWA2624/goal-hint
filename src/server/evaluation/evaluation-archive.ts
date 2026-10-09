import "server-only";

import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { evidenceFingerprint, evidenceSerialize } from "../evidence/evidence-input.ts";
import type { EvaluationDataset, EvaluationProtocol, EvaluationReport } from "./evaluation-contract.ts";
import { parseEvaluationDataset, parseEvaluationProtocol } from "./evaluation-input.ts";
import { createEvaluationReadinessReport, parseEvaluationReport, renderEvaluationReadinessReport, renderEvaluationReport } from "./evaluation-report.ts";
import { assertEvaluationReportIssued } from "./evaluation-service.ts";

export const MAX_EVALUATION_BYTES = 67_108_864;
export class EvaluationArchiveError extends Error {
  readonly reason: "invalid-artifact" | "invalid-file" | "unsafe-path" | "artifact-conflict" | "storage-error";
  constructor(reason: EvaluationArchiveError["reason"]) {
    super(`Forecast evaluation ${reason}; private input and storage diagnostics are withheld.`);
    this.name = "EvaluationArchiveError"; this.reason = reason;
  }
}
function code(error: unknown, expected: string): boolean { return error !== null && typeof error === "object" && "code" in error && error.code === expected; }
function maximum(value: number | undefined): number {
  const result = value ?? MAX_EVALUATION_BYTES;
  if (!Number.isSafeInteger(result) || result < 1 || result > MAX_EVALUATION_BYTES) throw new EvaluationArchiveError("invalid-artifact");
  return result;
}
function resolvedPath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || /[\0\r\n]/u.test(value) || value.split(/[\\/]/u).includes(".."))
    throw new EvaluationArchiveError("unsafe-path");
  return path.resolve(value);
}
/** Inspect each existing component instead of resolving through links/junctions. */
async function directoryAt(value: string, create: boolean): Promise<string> {
  const target = resolvedPath(value), root = path.parse(target).root;
  let current = root;
  for (const segment of ["", ...target.slice(root.length).split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    try {
      if (create && segment) try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (!code(error, "EEXIST")) throw error; }
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new EvaluationArchiveError("unsafe-path");
    } catch (error) { if (error instanceof EvaluationArchiveError) throw error; throw new EvaluationArchiveError("storage-error"); }
  }
  return target;
}
export async function readEvaluationFile(value: string, maxBytes = MAX_EVALUATION_BYTES): Promise<string> {
  const limit = maximum(maxBytes), file = resolvedPath(value);
  await directoryAt(path.dirname(file), false);
  try {
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) throw new EvaluationArchiveError("invalid-file");
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > limit || info.ino !== before.ino || info.dev !== before.dev) throw new EvaluationArchiveError("invalid-file");
      const buffer = Buffer.alloc(Math.min(limit + 1, info.size + 1));
      let length = 0;
      while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, length); if (result.bytesRead === 0) break; length += result.bytesRead; }
      if (length > limit || length !== info.size || (await handle.stat()).size !== info.size) throw new EvaluationArchiveError("invalid-file");
      return buffer.subarray(0, length).toString("utf8");
    } finally { await handle.close(); }
  } catch (error) { if (error instanceof EvaluationArchiveError) throw error; throw new EvaluationArchiveError("invalid-file"); }
}
function json(value: unknown): string { return `${evidenceSerialize(value)}\n`; }
function bounded(text: string, limit: number): string {
  if (Buffer.byteLength(text, "utf8") > limit) throw new EvaluationArchiveError("invalid-artifact"); return text;
}
async function immutableFile(directory: string, filename: string, content: string, limit: number): Promise<boolean> {
  bounded(content, limit); await directoryAt(directory, false);
  const target = path.join(directory, filename);
  try {
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new EvaluationArchiveError("unsafe-path");
    return false;
  } catch (error) {
    if (code(error, "EEXIST")) {
      if (await readEvaluationFile(target, limit) !== content) throw new EvaluationArchiveError("artifact-conflict");
      return true;
    }
    if (error instanceof EvaluationArchiveError) throw error; throw new EvaluationArchiveError("storage-error");
  }
}

/** The codec is restricted to the one native bigint field in evaluation fixtures. */
export function parseEvaluationJson(text: string, kind: "protocol" | "dataset" | "report", maxBytes = MAX_EVALUATION_BYTES): unknown {
  try {
    bounded(text, maximum(maxBytes)); const value: unknown = JSON.parse(text);
    if (kind === "dataset" && value !== null && typeof value === "object" && "fixtures" in value && Array.isArray(value.fixtures)) {
      for (const row of value.fixtures) {
        if (row === null || typeof row !== "object" || !("context" in row) || row.context === null || typeof row.context !== "object") continue;
        const integer = row.context.fixtureVersion;
        const decimal = typeof integer === "string" ? integer : integer !== null && typeof integer === "object" &&
          Object.keys(integer).length === 1 && typeof integer.$evidenceInteger === "string" ? integer.$evidenceInteger : null;
        if (decimal !== null) {
          if (!/^[1-9][0-9]{0,19}$/u.test(decimal) || BigInt(decimal) > 18_446_744_073_709_551_615n) throw new Error();
          row.context.fixtureVersion = BigInt(decimal);
        }
      }
    }
    return value;
  } catch { throw new EvaluationArchiveError("invalid-file"); }
}

export async function archiveEvaluationReport(options: Readonly<{ directory: string; protocol: unknown; dataset: unknown; report: unknown; maxBytes?: number }>) {
  const limit = maximum(options.maxBytes);
  let protocol: EvaluationProtocol, dataset: EvaluationDataset, report: EvaluationReport;
  try {
    assertEvaluationReportIssued(options.report, options.protocol as EvaluationProtocol, options.dataset as EvaluationDataset);
    protocol = parseEvaluationProtocol(options.protocol); dataset = parseEvaluationDataset(options.dataset); report = parseEvaluationReport(options.report);
    if (report.protocolId !== protocol.id || report.datasetId !== dataset.id || dataset.selectionVersion !== protocol.selectionVersion ||
      report.mode !== dataset.mode || report.ruleVersion !== protocol.ruleVersion || report.candidateModelId !== (protocol.candidateModel?.id ?? null) ||
      report.previousApprovedModelId !== (protocol.previousApprovedModel?.id ?? null) || report.calibrationVersion !== (protocol.candidateModel?.calibration.version ?? null) ||
      report.providerContractVersion !== protocol.providerContractVersion || evidenceFingerprint(report.window) !== evidenceFingerprint(protocol.windows[report.split]) ||
      report.gates.length !== (protocol.gates?.length ?? 0) || report.gates.some((gate) =>
        evidenceFingerprint(gate.criteria) !== evidenceFingerprint(protocol.gates?.find((entry) => entry.id === gate.id)))) throw new Error();
  } catch { throw new EvaluationArchiveError("invalid-artifact"); }
  const contents = { "protocol.json": json(protocol), "dataset.json": json(dataset), "report.json": json(report), "report.md": renderEvaluationReport(report, protocol) };
  if (Object.values(contents).reduce((sum, content) => sum + Buffer.byteLength(content, "utf8"), 0) > limit) throw new EvaluationArchiveError("invalid-artifact");
  const directory = await directoryAt(options.directory, true);
  if (report.split === "finalTest") await immutableFile(directory, `final-test-${protocol.id}.json`, json({ version: 1, protocolId: protocol.id,
    selectionVersion: protocol.selectionVersion, datasetId: dataset.id, reportId: report.id }), limit);
  const artifactDirectory = await directoryAt(path.join(directory, report.id), true);
  let fromCache = true;
  for (const [filename, content] of Object.entries(contents)) if (!await immutableFile(artifactDirectory, filename, content, limit)) fromCache = false;
  return Object.freeze({ directory: artifactDirectory, id: report.id, fromCache, protocolPath: path.join(artifactDirectory, "protocol.json"),
    datasetPath: path.join(artifactDirectory, "dataset.json"), reportPath: path.join(artifactDirectory, "report.json"), markdownPath: path.join(artifactDirectory, "report.md") });
}
export async function archiveEvaluationReadiness(options: Readonly<{ directory: string; maxBytes?: number }>) {
  const limit = maximum(options.maxBytes), report = createEvaluationReadinessReport(), directory = await directoryAt(options.directory, true);
  const reportPath = path.join(directory, "forecast-evaluation-readiness.json"), markdownPath = path.join(directory, "forecast-evaluation-readiness.md");
  const cachedJson = await immutableFile(directory, path.basename(reportPath), json(report), limit);
  const cachedMarkdown = await immutableFile(directory, path.basename(markdownPath), renderEvaluationReadinessReport(report), limit);
  return Object.freeze({ report, directory, id: report.id, reportPath, markdownPath, fromCache: cachedJson && cachedMarkdown });
}
