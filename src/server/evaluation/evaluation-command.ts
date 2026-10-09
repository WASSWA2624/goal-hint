import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluationAuthority } from "./evaluation-contract.ts";
import { archiveEvaluationReadiness, archiveEvaluationReport, MAX_EVALUATION_BYTES, parseEvaluationJson, readEvaluationFile } from "./evaluation-archive.ts";
import { parseEvaluationDataset, parseEvaluationProtocol } from "./evaluation-input.ts";
import { createEvaluationHarness } from "./evaluation-service.ts";

export class EvaluationCommandError extends Error {
  readonly reason: "invalid-arguments" | "invalid-input" | "authority-unavailable" | "evaluation-unavailable";
  constructor(reason: EvaluationCommandError["reason"]) {
    super(`Forecast evaluation ${reason}; private input and verifier diagnostics are withheld.`);
    this.name = "EvaluationCommandError"; this.reason = reason;
  }
}
const authorityMethods = ["authorize", "verifyProtocol", "verifyDataset", "verifyForecast", "verifyEvidence", "verifyResult", "verifyHistory", "verifyModel", "verifyUntouchedFinalTest"] as const;
async function loadAuthority(file: string): Promise<EvaluationAuthority> {
  try {
    if (path.extname(file) !== ".mjs") throw new Error();
    await readEvaluationFile(file, 1_048_576);
    // Explicit privileged local code; never infer authority from dataset labels.
    const authority: unknown = (await import(pathToFileURL(path.resolve(file)).href)).authority;
    if (authority === null || typeof authority !== "object" || authorityMethods.some((method) => typeof (authority as Record<string, unknown>)[method] !== "function")) throw new Error();
    return authority as EvaluationAuthority;
  } catch { throw new EvaluationCommandError("authority-unavailable"); }
}
/** No runtime policy, provider, credentials or database is constructed by this command. */
export async function runEvaluationCommand(argv: readonly string[]) {
  const flags: Record<string, string> = {};
  if (!Array.isArray(argv) || argv.length % 2 !== 0) throw new EvaluationCommandError("invalid-arguments");
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!, value = argv[index + 1];
    if (!["--protocol", "--dataset", "--authority", "--split", "--directory"].includes(flag) || typeof value !== "string" || value.length === 0 ||
      value.startsWith("--") || flags[flag] !== undefined) throw new EvaluationCommandError("invalid-arguments");
    flags[flag] = value;
  }
  const directory = flags["--directory"] ?? ".tmp/forecast-evaluation", inputs = [flags["--protocol"], flags["--dataset"], flags["--authority"]];
  if (inputs.every((entry) => entry === undefined)) {
    if (flags["--split"] !== undefined) throw new EvaluationCommandError("invalid-arguments");
    return { kind: "readiness" as const, ...await archiveEvaluationReadiness({ directory }) };
  }
  if (inputs.some((entry) => entry === undefined) || flags["--split"] !== undefined && !["validation", "calibration", "finalTest"].includes(flags["--split"]))
    throw new EvaluationCommandError("invalid-arguments");
  let protocol, dataset;
  try {
    protocol = parseEvaluationProtocol(parseEvaluationJson(await readEvaluationFile(flags["--protocol"]!), "protocol"));
    dataset = parseEvaluationDataset(parseEvaluationJson(await readEvaluationFile(flags["--dataset"]!), "dataset"));
  } catch { throw new EvaluationCommandError("invalid-input"); }
  const authority = await loadAuthority(flags["--authority"]!);
  try {
    const report = createEvaluationHarness({ authority, maxRows: 100_000, maxBytes: MAX_EVALUATION_BYTES }).evaluate({ protocol, dataset,
      split: (flags["--split"] ?? "finalTest") as "validation" | "calibration" | "finalTest" });
    return { kind: "evaluation" as const, report, ...await archiveEvaluationReport({ directory, protocol, dataset, report }) };
  } catch { throw new EvaluationCommandError("evaluation-unavailable"); }
}
