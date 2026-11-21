import "server-only";

import { bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type ReportingDate } from "../../domain/calendar.ts";
import type { BuiltSlip } from "../../domain/slip-builder.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseBestSlipStudyCapture, parseBestSlipStudyReceipt, type BestSlipStudyCapture, type BestSlipStudyReceipt } from "./best-slip-study-contract.ts";

const dayMs = 86_400_000;
const maximumWindowDays = 366;
const minimumScoredSlips = 40;
const minimumScoredDays = 14;
const minimumWinsAndLosses = 8;
const minimumDecisiveCoverage = 0.9;
const offsetSteps = 40;
const offsetIncrement = 0.05;
const offsetPenalty = 0.0025;
const version = "best-slip-study-evaluation-v1";
const bandOrder = new Map(bestSlipOddsBands.map(({ id }, index) => [id, index]));

type Outcome = BestSlipStudyReceipt["outcomes"][number]["outcome"];
type Row = Readonly<{ day: ReportingDate; band: BestSlipOddsBand; slip: BuiltSlip; outcome: Outcome | null }>;
type Sample = Readonly<{ day: ReportingDate; actual: 0 | 1; probabilities: readonly number[] }>;
type DayProof = Readonly<{ captureHash: string; receiptHash: string | null; retained: readonly string[] }>;
type Data = Readonly<{ from: number; until: number }>;
type Windows = Readonly<{ fitFrom: string; fitUntil: string; holdoutFrom: string; holdoutUntil: string }>;
type StudyInput = Readonly<{
  captures: readonly unknown[];
  receipts: readonly unknown[];
  scopeHash: string;
  windows: Windows;
  assessedAt: number;
}>;

const invalid = () => new RangeError("Invalid Best Slips study window, evidence identity or membership.");
const dayStart = (day: string) => validateReportingDateRange(day, day, 1).window.startInclusive;
const rowKey = (band: BestSlipOddsBand, legs: number) => `${band}:${legs}`;

function studyWindows(windows: Windows, assessedAt: number) {
  const { fitFrom, fitUntil, holdoutFrom, holdoutUntil } = windows;
  const fit = { from: dayStart(fitFrom), until: dayStart(fitUntil) };
  const holdout = { from: dayStart(holdoutFrom), until: dayStart(holdoutUntil) };
  if (fit.from >= fit.until || holdout.from >= holdout.until || fit.until > holdout.from ||
    fit.until - fit.from > maximumWindowDays * dayMs || holdout.until - holdout.from > maximumWindowDays * dayMs ||
    utcInstantFromEpochMilliseconds(assessedAt) < holdout.until) throw invalid();
  return { fit, holdout };
}

function checkedEvidence(input: StudyInput) {
  if (!/^[a-f0-9]{64}$/u.test(input.scopeHash)) throw invalid();
  const captures = new Map<string, BestSlipStudyCapture>();
  for (const value of input.captures) {
    const capture = parseBestSlipStudyCapture(value);
    if (captures.has(capture.hash) || capture.scopeHash !== input.scopeHash) throw invalid();
    captures.set(capture.hash, capture);
  }
  const receipts = new Map<string, BestSlipStudyReceipt[]>();
  for (const value of input.receipts) {
    const receipt = parseBestSlipStudyReceipt(value);
    const capture = captures.get(receipt.captureHash);
    if (!capture || receipt.observedAt <= capture.capturedAt) throw invalid();
    const actual = new Set(receipt.outcomes.map(({ slipId }) => slipId));
    if (actual.size !== receipt.outcomes.length || actual.size !== capture.slates.length ||
      !capture.slates.every(({ slip }) => actual.has(slip.id))) throw invalid();
    const group = receipts.get(receipt.captureHash) ?? [];
    group.push(receipt);
    receipts.set(receipt.captureHash, group);
  }
  for (const group of receipts.values()) {
    group.sort((left, right) => right.observedAt - left.observedAt);
    if (group.some((receipt, index) => receipt.observedAt === group[index - 1]?.observedAt)) throw invalid();
  }
  return { captures: [...captures.values()].sort((left, right) => left.capturedAt - right.capturedAt || left.hash.localeCompare(right.hash)), receipts };
}

/** Choose days and fixture membership from sealed decisions before reading their result values. */
function windowRows(captures: readonly BestSlipStudyCapture[], receipts: ReadonlyMap<string, readonly BestSlipStudyReceipt[]>,
  window: Data, usedFixtures: Set<string>) {
  const days = new Set<ReportingDate>();
  const rows: Row[] = [];
  const proof: DayProof[] = [];
  let examined = 0, eligible = 0, slates = 0, unscannedSlates = 0, duplicateFixtures = 0, extraCaptures = 0;
  let truncatedDays = 0, partialCoverageDays = 0, daysWithSlate = 0;
  for (const capture of captures) {
    if (capture.capturedAt < window.from || capture.capturedAt >= window.until) continue;
    const day = getReportingDate(utcInstantFromEpochMilliseconds(capture.capturedAt));
    if (days.has(day)) { extraCaptures++; continue; }
    days.add(day);
    examined += capture.examined;
    eligible += capture.eligible;
    slates += capture.slates.length;
    truncatedDays += Number(capture.searchLimited);
    partialCoverageDays += Number(capture.partialCoverage);
    daysWithSlate += Number(capture.slates.length > 0);
    if (capture.searchLimited || capture.partialCoverage) {
      unscannedSlates += capture.slates.length;
      proof.push({ captureHash: capture.hash, receiptHash: null, retained: [] });
      continue;
    }
    const ordered = [...capture.slates].sort((left, right) =>
      bandOrder.get(left.band)! - bandOrder.get(right.band)! || left.slip.id.localeCompare(right.slip.id));
    const original = receipts.get(capture.hash)?.find(({ observedAt }) => observedAt < window.until);
    const outcomes = new Map(original?.outcomes.map(({ slipId, outcome }) => [slipId, outcome]));
    const retained: string[] = [];
    for (const { band, slip } of ordered) {
      if (slip.selections.some(({ fixtureId }) => usedFixtures.has(fixtureId))) { duplicateFixtures++; continue; }
      for (const { fixtureId } of slip.selections) usedFixtures.add(fixtureId);
      retained.push(slip.id);
      rows.push({ day, band, slip, outcome: outcomes.get(slip.id) ?? null });
    }
    proof.push({ captureHash: capture.hash, receiptHash: original?.hash ?? null, retained });
  }
  return { rows, evidenceHash: evidenceFingerprint(proof),
    coverage: { scheduledDays: (window.until - window.from) / dayMs, capturedDays: days.size, daysWithSlate,
      examined, eligible, slates, acceptedSlates: rows.length, unscannedSlates, duplicateFixtures, extraCaptures, truncatedDays, partialCoverageDays } };
}

function outcomeCoverage(rows: readonly Row[]) {
  const counts = { won: 0, lost: 0, void: 0, pending: 0, unavailable: 0, missingReceipt: 0 };
  const samples: Sample[] = [];
  for (const { day, slip, outcome } of rows) {
    counts[outcome ?? "missingReceipt"]++;
    if (outcome === "won" || outcome === "lost") {
      samples.push({ day, actual: outcome === "won" ? 1 : 0, probabilities: slip.selections.map(({ probability }) => probability) });
    }
  }
  return { samples, coverage: { ...counts, opportunities: rows.length,
    decisive: samples.length, decisiveCoverage: rows.length ? samples.length / rows.length : null,
    decisiveDays: new Set(samples.map(({ day }) => day)).size } };
}

const square = (value: number) => value * value;

function modelInputs(probabilities: readonly number[]) {
  const lower = Math.max(0, probabilities.reduce((sum, probability) => sum + probability, 0) - probabilities.length + 1);
  const upper = Math.min(...probabilities);
  const product = Math.min(upper, Math.max(lower, probabilities.reduce((value, probability) => value * probability, 1)));
  return { lower, upper, product };
}

/** Fit an offset on the joint outcome, with independent products serving as a reference only. */
function candidateProbability({ lower, upper, product }: ReturnType<typeof modelInputs>, offset: number) {
  const fraction = (product - lower) / (upper - lower);
  if (offset === 0 || !(fraction > 0 && fraction < 1)) return product;
  return Math.min(upper, lower + (upper - lower) / (1 + Math.exp(Math.log1p(-fraction) - Math.log(fraction) - offset)));
}

function fitOffset(samples: readonly Sample[]) {
  const rows = samples.map(({ actual, probabilities }) => ({ actual, inputs: modelInputs(probabilities) }));
  function score(offset: number) {
    return rows.reduce((sum, { actual, inputs }) => sum + square(candidateProbability(inputs, offset) - actual), 0) / rows.length
      + offsetPenalty * square(offset);
  }
  let selected = 0, loss = score(0);
  for (let step = 1; step <= offsetSteps; step++) {
    for (const direction of [-1, 1]) {
      const offset = direction * step * offsetIncrement, next = score(offset);
      if (next < loss) { selected = offset; loss = next; }
    }
  }
  return selected;
}

type Score = Readonly<{ day: ReportingDate; value: number }>;
function clusterInterval(scores: readonly Score[]) {
  if (!scores.length || scores.some(({ value }) => !Number.isFinite(value))) return null;
  const byDay = new Map<ReportingDate, { count: number; sum: number }>();
  let total = 0;
  for (const { day, value } of scores) {
    const block = byDay.get(day) ?? { count: 0, sum: 0 };
    block.count++;
    block.sum += value;
    byDay.set(day, block);
    total += value;
  }
  const mean = total / scores.length, days = byDay.size;
  if (days < 2) return { mean, days, lower: null, upper: null };
  const variance = [...byDay.values()].reduce((sum, { count, sum: group }) => sum + square(group - count * mean), 0);
  const margin = 1.96 * Math.sqrt(days / (days - 1) * variance) / scores.length;
  return { mean, days, lower: mean - margin, upper: mean + margin };
}

const logScore = (q: number, actual: number) => actual === 1 ? -Math.log(q) : -Math.log1p(-q);
type Prediction = Readonly<{ day: ReportingDate; actual: 0 | 1; product: number; candidate: number }>;
function holdoutMetrics(samples: readonly Sample[], offset: number) {
  const rows: Prediction[] = samples.map(({ day, actual, probabilities }) => {
    const inputs = modelInputs(probabilities);
    return { day, actual, product: inputs.product, candidate: candidateProbability(inputs, offset) };
  });
  function summarize(key: "product" | "candidate") {
    const brier = rows.reduce((sum, row) => sum + square(row[key] - row.actual), 0) / rows.length;
    const logLoss = rows.reduce((sum, row) => sum + logScore(row[key], row.actual), 0) / rows.length;
    const bins = Array.from({ length: 5 }, () => ({ n: 0, wins: 0, probability: 0 }));
    for (const row of rows) {
      const bin = bins[Math.min(4, Math.floor(row[key] * 5))]!;
      bin.n++;
      bin.wins += row.actual;
      bin.probability += row[key];
    }
    return { average: rows.reduce((sum, row) => sum + row[key], 0) / rows.length, brier,
      logLoss: Number.isFinite(logLoss) ? logLoss : null, infiniteLogLoss: !Number.isFinite(logLoss),
      observedMinusPredicted: clusterInterval(rows.map((row) => ({ day: row.day, value: row.actual - row[key] }))),
      calibration: bins.map(({ n, wins, probability }, index) => ({ from: index / 5, until: (index + 1) / 5, n, wins,
        average: n ? probability / n : null, hitRate: n ? wins / n : null })) };
  }
  return { observedHitRate: rows.reduce((sum, row) => sum + row.actual, 0) / rows.length,
    product: summarize("product"), candidate: summarize("candidate"),
    candidateMinusProductBrier: clusterInterval(rows.map(({ day, actual, product, candidate }) =>
      ({ day, value: square(candidate - actual) - square(product - actual) }))),
    candidateMinusProductLogLoss: clusterInterval(rows.map(({ day, actual, product, candidate }) =>
      ({ day, value: logScore(candidate, actual) - logScore(product, actual) }))) };
}

type Coverage = ReturnType<typeof outcomeCoverage>["coverage"];
function studySupport(value: Coverage) {
  const reasons: string[] = [];
  if (value.decisive < minimumScoredSlips) reasons.push("too-few-decisive-slips");
  if (value.decisiveDays < minimumScoredDays) reasons.push("too-few-distinct-days");
  if (value.won < minimumWinsAndLosses || value.lost < minimumWinsAndLosses) reasons.push("too-few-wins-or-losses");
  if ((value.decisiveCoverage ?? 0) < minimumDecisiveCoverage) reasons.push("low-decisive-coverage");
  return reasons;
}

/** Offline evaluation. A report never authorizes an estimate, worker or public claim. */
export function evaluateBestSlipStudy(input: StudyInput) {
  const windows = studyWindows(input.windows, input.assessedAt), evidence = checkedEvidence(input);
  const used = new Set<string>();
  const fit = windowRows(evidence.captures, evidence.receipts, windows.fit, used);
  const holdout = windowRows(evidence.captures, evidence.receipts, windows.holdout, used);
  const groups = new Map<string, { band: BestSlipOddsBand; legs: number; fit: Row[]; holdout: Row[] }>();
  for (const [phase, rows] of [["fit", fit.rows], ["holdout", holdout.rows]] as const) {
    for (const row of rows) {
      const legs = row.slip.selections.length, key = rowKey(row.band, legs);
      const group = groups.get(key) ?? { band: row.band, legs, fit: [], holdout: [] };
      group[phase].push(row);
      groups.set(key, group);
    }
  }
  const strata = [...groups.values()].sort((left, right) =>
    bandOrder.get(left.band)! - bandOrder.get(right.band)! || left.legs - right.legs).map(({ band, legs, ...rows }) => {
    const fitData = outcomeCoverage(rows.fit), heldOut = outcomeCoverage(rows.holdout);
    const fitReasons = studySupport(fitData.coverage), holdoutReasons = studySupport(heldOut.coverage);
    const offset = fitReasons.length ? null : fitOffset(fitData.samples);
    const metrics = offset === null || holdoutReasons.length ? null : holdoutMetrics(heldOut.samples, offset);
    return { band, legs, status: metrics ? "evaluated" as const : "insufficient" as const,
      fit: fitData.coverage, holdout: heldOut.coverage, reasons: { fit: fitReasons, holdout: holdoutReasons }, offset, metrics };
  });
  const fitArtifactHash = evidenceFingerprint({ version, scopeHash: input.scopeHash, fit: windows.fit,
    evidenceHash: fit.evidenceHash, offsets: strata.flatMap(({ band, legs, offset }) => offset === null ? [] : [{ band, legs, offset }]) });
  const report = { version, status: strata.some(({ status }) => status === "evaluated") ? "evaluated" as const : "insufficient" as const,
    approvedForPublication: false as const, scopeHash: input.scopeHash, windows: { ...input.windows }, assessedAt: input.assessedAt,
    minimums: { decisiveSlipsPerWindow: minimumScoredSlips, decisiveDaysPerWindow: minimumScoredDays,
      winsAndLossesPerWindow: minimumWinsAndLosses, decisiveCoveragePerWindow: minimumDecisiveCoverage },
    fit: { ...fit.coverage, ...outcomeCoverage(fit.rows).coverage, evidenceHash: fit.evidenceHash, artifactHash: fitArtifactHash },
    holdout: { ...holdout.coverage, ...outcomeCoverage(holdout.rows).coverage, evidenceHash: holdout.evidenceHash },
    strata };
  return freezeEvidence({ ...report, hash: evidenceFingerprint(report) });
}
