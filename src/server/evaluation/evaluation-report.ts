import "server-only";

import { z } from "zod";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { EVALUATION_VERSION, evaluationSystems } from "./evaluation-contract.ts";
import type { EvaluationReport } from "./evaluation-contract.ts";
import { EvaluationInputError, parseEvaluationProtocol } from "./evaluation-input.ts";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const text = z.string().max(4096);
const count = z.number().int().nonnegative().max(100_000);
const probability = z.number().finite().min(0).max(1);
const score = z.number().finite().nonnegative().nullable();
const family = z.enum(["match-result", "double-chance", "total-goals", "both-teams-to-score"]);
const status = z.enum(["passed", "failed", "pending"]);
const criteria = z.object({ id: text, purpose: z.enum(["candidate", "public-claim"]), system: z.enum(evaluationSystems), family, horizonId: text,
  minimumSamples: z.number().int().positive().max(1_000_000), minimumCoverage: probability, maximumBrier: z.number().finite().min(0).max(2).nullable(),
  maximumLogLoss: z.number().finite().nonnegative().nullable(), maximumCalibrationError: probability.nullable(),
  baseline: z.enum(["league-frequency", "team-strength"]).nullable(), maximumBrierDifference: z.number().finite().min(-2).max(2).nullable() }).strict();
const metrics = z.object({ count, correct: count, incorrect: count, hitRate: probability.nullable(), brier: score,
  logLoss: score, calibrationError: probability.nullable(), calibration: z.array(z.object({ selection: text,
    lower: probability, upper: probability, count, meanProbability: probability.nullable(), observedFrequency: probability.nullable(),
    interval: z.object({ lower: probability, upper: probability }).strict().nullable(),
  }).strict()).max(303) }).strict().refine((value) => value.correct + value.incorrect === value.count &&
    (value.count === 0 ? [value.hitRate, value.brier, value.logLoss, value.calibrationError].every((item) => item === null) :
      [value.hitRate, value.brier, value.logLoss, value.calibrationError].every((item) => item !== null)));
const coverage = z.object({ total: count, available: count, unavailable: count, void: count, pending: count, settled: count,
  sources: z.object({ ai: count, "api-football": count }).strict() }).strict().refine((value) =>
  value.total === value.available + value.unavailable + value.void && value.available === value.pending + value.settled);
const schema = z.object({ version: z.literal(EVALUATION_VERSION), id: hash, hash, protocolId: hash, datasetId: hash,
  mode: z.enum(["historical", "prospective", "synthetic"]), split: z.enum(["validation", "calibration", "finalTest"]),
  ruleVersion: z.literal("regulation-markets-v1"), window: z.object({ startsAt: z.number().int(), endsAt: z.number().int() }).strict().nullable(),
  fixtureDatePeriod: z.object({ first: text.nullable(), last: text.nullable() }).strict(), candidateModelId: hash.nullable(), previousApprovedModelId: hash.nullable(),
  calibrationVersion: text.nullable(), providerContractVersion: text.nullable(), selectedRows: count,
  excludedRows: z.array(z.object({ key: hash, reason: text }).strict()).max(100_000),
  cells: z.array(z.object({ system: z.enum(evaluationSystems), family, horizonId: text, versions: z.array(text).max(100_000), coverage, metrics,
    sourceMetrics: z.object({ ai: metrics, "api-football": metrics }).strict().nullable() }).strict()).max(640),
  comparisons: z.array(z.object({ kind: z.enum(["baseline", "source-comparison"]), system: z.enum(["ai", "api-football", "combined"]),
    referenceSystem: z.enum(evaluationSystems), family, horizonId: text, count, fixtureKeysHash: hash, candidate: metrics, reference: metrics,
    brierDifference: z.number().finite().min(-2).max(2).nullable() }).strict()).max(1536),
  gates: z.array(z.object({ id: text, purpose: z.enum(["candidate", "public-claim"]), criteria, status, diagnostic: status, reasons: z.array(text).max(100) }).strict()
    .refine((value) => value.id === value.criteria.id && value.purpose === value.criteria.purpose)).max(1000),
  decision: z.enum(["retain-previous-approved", "remain-provisional", "eligible-for-independent-review"]),
  publicClaimStatus: z.enum(["pending", "blocked", "eligible-for-independent-review"]), limitations: z.array(text).max(100_000),
  prospectiveRequirements: z.array(text).max(100), promotionPerformed: z.literal(false), publicClaimAuthorized: z.literal(false),
}).strict();

/** Integrity checks do not replace the harness's independently trusted provenance checks. */
export function parseEvaluationReport(value: unknown): EvaluationReport {
  try {
    const parsed = schema.parse(value), { id, hash: checksum, ...body } = parsed;
    if (id !== checksum || evidenceFingerprint(body) !== checksum) throw new Error();
    return freezeEvidence(parsed) as EvaluationReport;
  } catch { throw new EvaluationInputError("invalid-request"); }
}
const cell = (value: string | number | null) => value === null ? "pending" : String(value).replace(/[&<>|`\r\n]/gu,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "`": "&#96;", "\r": " ", "\n": " " })[character]!);
const number = (value: number | null) => value === null ? "pending" : Number.isInteger(value) ? String(value) : value.toPrecision(8);
const bound = (value: number | null) => value === null ? "none" : number(value);
const instant = (value: number) => new Date(value).toISOString();
function privateLimitation(value: string): string {
  const source = /^(ai|api-football|combined): /u.exec(value)?.[1];
  return source ? `${source}: forecast unavailable; the private dataset retains the reason.` : value;
}

export function renderEvaluationReport(value: unknown, protocolValue?: unknown): string {
  const report = parseEvaluationReport(value), protocol = protocolValue === undefined ? null : parseEvaluationProtocol(protocolValue);
  if (protocol !== null && protocol.id !== report.protocolId) throw new EvaluationInputError("invalid-request");
  const lines = ["# Chronological forecast evaluation", "", `Report: ${report.id}`, `Protocol: ${report.protocolId}`, `Dataset: ${report.datasetId}`, "",
    `Mode: ${report.mode}. Split: ${report.split}. Rule: ${report.ruleVersion}.`,
    report.mode === "synthetic" ? "Synthetic observations verify software contracts only; they establish no actual forecast quality or calibration." :
      "Measured records require independent provenance verification; reported eligibility does not authorize publication.", "",
    `Window: ${report.window === null ? "pending" : `${instant(report.window.startsAt)} to ${instant(report.window.endsAt)} (end excluded)`}.`,
    `Fixture date period (EAT): ${report.fixtureDatePeriod.first ?? "pending"} to ${report.fixtureDatePeriod.last ?? "pending"}.`,
    `Selected rows: ${report.selectedRows}. Excluded rows: ${report.excludedRows.length}.`, "",
    `Candidate model: ${report.candidateModelId ?? "pending"}. Previous approved model: ${report.previousApprovedModelId ?? "none"}.`,
    `Calibration: ${cell(report.calibrationVersion)}. Provider contract: ${cell(report.providerContractVersion)}.`,
    `Candidate decision: ${report.decision}. Public-claim status: ${report.publicClaimStatus}.`,
    "Promotion performed: false. Public claim authorized: false.", "", "## Coverage and scores", "",
    "Each settled fixture contributes one selected pick per family/horizon. Pending, void and unavailable rows do not enter hit rate.", "",
    "| System | Family | Horizon | Versions | Total | Available | Unavailable | Void | Pending | Settled | AI / provider | Correct / incorrect | Hit rate | Brier | Log loss | Calibration error |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |"];
  for (const entry of report.cells) {
    const c = entry.coverage, m = entry.metrics;
    lines.push(`| ${entry.system} | ${entry.family} | ${cell(entry.horizonId)} | ${entry.versions.map(cell).join(", ") || "none"} | ${c.total} | ${c.available} | ${c.unavailable} | ${c.void} | ${c.pending} | ${c.settled} | ${c.sources.ai} / ${c.sources["api-football"]} | ${m.correct} / ${m.incorrect} | ${number(m.hitRate)} | ${number(m.brier)} | ${number(m.logLoss)} | ${number(m.calibrationError)} |`);
  }
  lines.push("", "Brier scale: match result 0–2; binary families and the mean of double-chance binary events 0–1. Natural-log loss uses original unrounded probabilities.",
    "Coverage is available / (total − void). Available includes pending forecasts; settled alone is the metric denominator.", "", "## Combined source breakdown", "",
    "| Family | Horizon | Selected source | Settled | Correct / incorrect | Hit rate | Brier | Log loss |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: |");
  for (const entry of report.cells.filter((value) => value.system === "combined")) for (const source of ["ai", "api-football"] as const) {
    const m = entry.sourceMetrics?.[source];
    if (m) lines.push(`| ${entry.family} | ${cell(entry.horizonId)} | ${source} | ${m.count} | ${m.correct} / ${m.incorrect} | ${number(m.hitRate)} | ${number(m.brier)} | ${number(m.logLoss)} |`);
  }
  lines.push("", "## Matched comparisons", "",
    "| Kind | System | Reference | Family | Horizon | Matched count | Keys hash | Candidate Brier | Reference Brier | Difference |",
    "| --- | --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: |");
  for (const entry of report.comparisons) lines.push(`| ${entry.kind} | ${entry.system} | ${entry.referenceSystem} | ${entry.family} | ${cell(entry.horizonId)} | ${entry.count} | ${entry.fixtureKeysHash} | ${number(entry.candidate.brier)} | ${number(entry.reference.brier)} | ${number(entry.brierDifference)} |`);
  lines.push("", "## Gates", "", "| Gate | Purpose / scope | Minimum N / coverage | Maximum Brier / log loss / calibration error | Baseline / maximum Brier difference | Status / diagnostic | Reasons |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const entry of report.gates) {
    const gate = entry.criteria;
    lines.push(`| ${cell(entry.id)} | ${entry.purpose} / ${gate.system} / ${gate.family} / ${cell(gate.horizonId)} | ${gate.minimumSamples} / ${number(gate.minimumCoverage)} | ${bound(gate.maximumBrier)} / ${bound(gate.maximumLogLoss)} / ${bound(gate.maximumCalibrationError)} | ${gate.baseline ?? "none"} / ${bound(gate.maximumBrierDifference)} | ${entry.status} / ${entry.diagnostic} | ${entry.reasons.map(cell).join(", ") || "none"} |`);
  }
  lines.push("", "## Reliability bands", "", "Wilson intervals are pointwise and assume independent fixtures within each selection/horizon; overlapping alternatives are not extra independent fixtures.", "",
    "| System | Family | Horizon | Selection | Band | Count | Mean probability | Observed frequency | Wilson lower | Wilson upper |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const entry of report.cells) for (const band of entry.metrics.calibration) lines.push(`| ${entry.system} | ${entry.family} | ${cell(entry.horizonId)} | ${cell(band.selection)} | [${number(band.lower)}, ${number(band.upper)}${band.upper === 1 ? "]" : ")"} | ${band.count} | ${number(band.meanProbability)} | ${number(band.observedFrequency)} | ${number(band.interval?.lower ?? null)} | ${number(band.interval?.upper ?? null)} |`);
  lines.push("", "## Limitations", "", ...report.limitations.map((value) => `- ${cell(privateLimitation(value))}`), "", "## Prospective requirements", "", ...report.prospectiveRequirements.map((value) => `- ${cell(value)}`), "");
  return lines.join("\n");
}

export function createEvaluationReadinessReport() {
  const body = { version: "evaluation-readiness-v1" as const, mode: "readiness" as const, actualForecastObservations: 0,
    dispatchedLiveRequests: 0, measuredAccuracy: null, calibrationQualified: false, historicalAiComparison: "unavailable" as const,
    historicalProviderComparison: "unavailable" as const, modelStatus: "provisional-unapproved" as const,
    pending: ["OP-15 actual AI provider/model and calibration", "OP-16 chronological windows, cohorts, baseline parameters, minimum samples and quality/coverage gates",
      "OP-17 independent final-test evidence and public-claim requirements"],
    limitations: ["No actual dataset or operating approval was supplied to this readiness command.", "The recorded 008 trial has zero real observations and proves no historical prediction coverage.",
      "Synthetic checks verify software contracts only; no fixed accuracy or calibration promise follows.", "The later prospective shadow operation remains required."],
    prospectiveRequirements: ["Approve exact source/model rights, versions and operating budgets; freeze competition/horizon cohorts and chronological splits.",
      "Freeze baseline parameters, reliability bands, sample and quality/public-claim gates before inspecting the final test.",
      "Capture original AI/provider/combined forecasts and source-availability clocks at each predeclared horizon, including missing attempts.",
      "Retain immutable fixture/cycle manifests and verified regulation results; preserve voids and later correction versions.",
      "Evaluate identical matched cohorts with trusted provenance and untouched final-test verification; continue approved private shadow operation before launch."],
    promotionPerformed: false as const, publicClaimAuthorized: false as const };
  const id = evidenceFingerprint(body); return freezeEvidence({ ...body, id, hash: id });
}
export type EvaluationReadinessReport = ReturnType<typeof createEvaluationReadinessReport>;
export function renderEvaluationReadinessReport(value: EvaluationReadinessReport): string {
  if (evidenceFingerprint(value) !== evidenceFingerprint(createEvaluationReadinessReport())) throw new EvaluationInputError("invalid-request");
  return ["# Forecast evaluation readiness — 014", "", `Report: ${value.id}`, "", "Actual forecast observations in this report: 0. Dispatched live requests: 0.",
    "Measured accuracy: unavailable. Calibration qualified: false. Model status: provisional/unapproved.",
    "Historical AI comparison: unavailable. Historical provider comparison: unavailable.",
    "Promotion performed: false. Public claim authorized: false.", "", "## Pending approvals and inputs", "", ...value.pending.map((item) => `- ${item}`),
    "", "## Evidence limitations", "", ...value.limitations.map((item) => `- ${item}`), "", "## Prospective capture plan", "", ...value.prospectiveRequirements.map((item, index) => `${index + 1}. ${item}`), ""].join("\n");
}
