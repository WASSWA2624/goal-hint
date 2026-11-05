import "server-only";

import { bestSlipBand, bestSlipOddsBandFor, bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { calendarRules } from "../../domain/calendar.ts";
import { settleMarketSelection, isPlayedFinalStatus, type SettlementContext } from "../../domain/market-settlement.ts";
import { isMarketSelection } from "../../domain/markets.ts";
import { summarizeSlipPerformance } from "../../domain/slip-performance.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { wilson } from "../evaluation/evaluation-metrics.ts";
import type { ShadowSlip } from "./shadow-slip-selection.ts";

export type ShadowSlipCapture = Readonly<{
  id: string;
  mode: "synthetic" | "historical" | "prospective";
  capturedAt: number;
  evidenceCutoffAt: number;
  modelVersion: string;
  evidenceReference: string;
  band: BestSlipOddsBand;
  slip: ShadowSlip | null;
  /** Aligned with the immutable original selections. */
  oddsObservedAt: readonly number[];
}>;
export type SealedShadowSlipCapture = ShadowSlipCapture & Readonly<{ hash: string }>;
export type ShadowSlipResultObservation = Readonly<{
  fixtureId: string;
  cycleId: string | null;
  scheduledKickoffAt: number;
  observedAt: number;
  evidenceReference: string;
  context: SettlementContext;
}>;
type Outcome = "won" | "lost" | "void" | "cancelled" | "pending" | "unavailable";
type EvaluatedSample = Readonly<{ capture: SealedShadowSlipCapture; outcome: Outcome }>;

/** Call when the prediction is first retained, before adding any result observations. This creates no publication. */
export function captureShadowSlipForEvaluation(input: ShadowSlipCapture): SealedShadowSlipCapture {
  if (!input.id || !["synthetic", "historical", "prospective"].includes(input.mode)
    || !Number.isSafeInteger(input.capturedAt) || input.capturedAt <= 0
    || !Number.isSafeInteger(input.evidenceCutoffAt) || input.evidenceCutoffAt > input.capturedAt || input.evidenceCutoffAt < 0
    || !input.modelVersion.trim() || !input.evidenceReference.trim() || !bestSlipOddsBands.some(band => band.id === input.band)) {
    throw new RangeError("Invalid shadow slip capture.");
  }
  const { slip } = input;
  if (!slip) {
    if (input.oddsObservedAt.length) throw new RangeError("An abstention cannot contain quote timestamps.");
  } else {
    if (!slip.selections.length || new Set(slip.selections.map(selection => selection.fixtureId)).size !== slip.selections.length
      || input.oddsObservedAt.length !== slip.selections.length || bestSlipOddsBandFor(slip.totalOdds) !== input.band
      || !Number.isFinite(slip.estimatedProbability) || slip.estimatedProbability < 0 || slip.estimatedProbability > 1
      || slip.oddsBasis !== "bookmaker") throw new RangeError("Invalid original shadow slip.");
    let product = 1n, denominator = 1n, marginalSum = 0, marginalMinimum = 1;
    for (const [index, selection] of slip.selections.entries()) {
      const observedAt = input.oddsObservedAt[index]!;
      if (!Number.isSafeInteger(selection.kickoffAt) || input.capturedAt >= selection.kickoffAt - calendarRules.cutoffSecondsBeforeKickoff * 1000
        || !Number.isSafeInteger(observedAt) || observedAt < 0 || observedAt > input.capturedAt
        || selection.forecast && selection.forecast.publishedAt > input.capturedAt
        || !isMarketSelection(selection.family, selection.selection) || !Number.isFinite(selection.probability)
        || selection.probability < 0 || selection.probability > 1
        || selection.oddsBasis !== "bookmaker" || !/^[1-9]\d*\.\d{2}$/.test(selection.odds)
        || BigInt(selection.odds.replace(".", "")) <= 100n) {
        throw new RangeError("A shadow slip must retain only original pre-cutoff picks and prices.");
      }
      product *= BigInt(selection.odds.replace(".", "")); denominator *= 100n;
      marginalSum += selection.probability; marginalMinimum = Math.min(marginalMinimum, selection.probability);
    }
    if ((product * 200n + denominator) / (2n * denominator) !== BigInt(slip.totalOdds.replace(".", ""))) {
      throw new RangeError("The original total price does not match its selections.");
    }
    const band = bestSlipBand(input.band);
    // Preserve the existing exact inclusive hundredth bounds, including their sub-hundredth gaps.
    if (product * 100n < BigInt(band.minimumTotal) * denominator || product * 100n > BigInt(band.maximumTotal) * denominator) {
      throw new RangeError("The original exact price is outside its odds band.");
    }
    const tolerance = Number.EPSILON * slip.selections.length * 2;
    if (Math.abs(slip.averageProbability - marginalSum / slip.selections.length) > tolerance
      || !Number.isFinite(slip.averageProbability)
      || slip.estimatedProbability < Math.max(0, marginalSum - slip.selections.length + 1) - tolerance
      || slip.estimatedProbability > marginalMinimum + tolerance) throw new RangeError("Incoherent original slip probabilities.");
  }
  const capture = structuredClone(input);
  return freezeEvidence({ ...capture, hash: evidenceFingerprint(capture) });
}

const resultKey = (fixtureId: string, cycleId: string | null, kickoffAt: number) => JSON.stringify([fixtureId, cycleId, kickoffAt]);
function outcome(capture: SealedShadowSlipCapture, observations: ReadonlyMap<string, readonly ShadowSlipResultObservation[]>): Outcome {
  if (!capture.slip) return "unavailable";
  const legs = capture.slip.selections.map(selection => {
    const matching = (observations.get(resultKey(selection.fixtureId, selection.forecast?.cycleId ?? null, selection.kickoffAt)) ?? [])
      .filter(result => result.observedAt >= capture.capturedAt);
    const result = matching[0];
    if (!result || matching[1]?.observedAt === result.observedAt
      && evidenceFingerprint(matching[1]) !== evidenceFingerprint(result)
      || isPlayedFinalStatus(result.context.status) && result.observedAt < selection.kickoffAt) return "unavailable" as const;
    const settled = settleMarketSelection(selection.family, selection.selection, result.context);
    if (settled.status === "incorrect") return "lost" as const;
    if (settled.status === "correct") return "won" as const;
    if (settled.status === "void") return result.context.status === "canceled" ? "cancelled" as const : "void" as const;
    if (settled.status === "unavailable" || isPlayedFinalStatus(result.context.status) || result.context.status === "unknown") return "unavailable" as const;
    return "pending" as const;
  });
  // Match the existing aggregate rule: a verified lost leg establishes a loss immediately.
  return legs.includes("lost") ? "lost" : legs.includes("unavailable") ? "unavailable" : legs.includes("pending") ? "pending"
    : legs.includes("cancelled") ? "cancelled" : legs.includes("void") ? "void" : "won";
}

function summarize(samples: readonly EvaluatedSample[]) {
  const counts: Record<Outcome, number> = { won: 0, lost: 0, void: 0, cancelled: 0, pending: 0, unavailable: 0 };
  const forecastCount = samples.filter(sample => sample.capture.slip !== null).length;
  let brier = 0, logLoss = 0, infiniteLogLoss = false;
  const bins = Array.from({ length: 10 }, (_, index) => ({ lower: index / 10, upper: (index + 1) / 10,
    count: 0, sumProbability: 0, wins: 0 }));
  for (const { capture, outcome } of samples) {
    counts[outcome]++;
    if (!capture.slip || outcome !== "won" && outcome !== "lost") continue;
    const probability = capture.slip.estimatedProbability, actual = outcome === "won" ? 1 : 0;
    brier += (probability - actual) ** 2;
    const loss = actual ? -Math.log(probability) : -Math.log1p(-probability);
    if (!Number.isFinite(loss)) infiniteLogLoss = true;
    else logLoss += loss;
    const bin = bins[Math.min(9, Math.floor(probability * 10))]!;
    bin.count++; bin.sumProbability += probability; bin.wins += actual;
  }
  const count = counts.won + counts.lost;
  const calibration = bins.map(bin => ({ lower: bin.lower, upper: bin.upper, count: bin.count,
    meanProbability: bin.count ? bin.sumProbability / bin.count : null,
    observedFrequency: bin.count ? bin.wins / bin.count : null,
    interval: bin.count ? wilson(bin.wins, bin.count, 1.96) : null }));
  const returns = summarizeSlipPerformance(samples.flatMap(({ capture, outcome }) => capture.slip
    && (outcome === "won" || outcome === "lost") ? [{ id: capture.id, publishedAt: capture.capturedAt,
      totalOdds: capture.slip.totalOdds, outcome }] : []));
  return { opportunities: samples.length, forecasts: forecastCount, abstained: samples.length - forecastCount,
    coverage: samples.length ? forecastCount / samples.length : null, ...counts, sampleCount: count,
    settlementCoverage: forecastCount ? count / forecastCount : null,
    hitRate: count ? counts.won / count : null, hitRateInterval: count ? wilson(counts.won, count, 1.96) : null,
    brier: count ? brier / count : null, logLoss: count && !infiniteLogLoss ? logLoss / count : null, infiniteLogLoss,
    calibration, calibrationError: count ? calibration.reduce((sum, bin) => sum + bin.count / count
      * Math.abs((bin.meanProbability ?? 0) - (bin.observedFrequency ?? 0)), 0) : null,
    illustrativeReturns: { basis: returns.basis, quoteConvention: "captured-two-decimal-total-quote", sampleCount: returns.returnsSampleCount, stakeUnits: returns.stakeUnits,
      returnUnits: returns.returnUnits, profitUnits: returns.profitUnits, roi: returns.roi } };
}

/** Historical labels are supplied, never scraped or inferred. Results only adjudicate sealed originals as of the report. */
export function evaluateShadowSlips(input: Readonly<{
  captures: readonly SealedShadowSlipCapture[];
  results: readonly ShadowSlipResultObservation[];
  asOf: number;
}>) {
  if (!Number.isSafeInteger(input.asOf) || input.asOf <= 0) throw new RangeError("Invalid evaluation cutoff.");
  const sourceModes = [...new Set(input.captures.map(capture => capture.mode))];
  if (sourceModes.length > 1) throw new RangeError("Evaluate synthetic, historical and prospective cohorts separately.");
  const observations = new Map<string, ShadowSlipResultObservation[]>();
  for (const result of input.results) {
    if (!Number.isSafeInteger(result.observedAt) || result.observedAt > input.asOf || !result.evidenceReference.trim()) continue;
    const key = resultKey(result.fixtureId, result.cycleId, result.scheduledKickoffAt), group = observations.get(key) ?? [];
    group.push(result); observations.set(key, group);
  }
  for (const group of observations.values()) group.sort((left, right) => right.observedAt - left.observedAt);
  const ids = new Set<string>();
  const samples = input.captures.map(capture => {
    const { hash, ...original } = capture;
    if (ids.has(capture.id) || capture.capturedAt > input.asOf || captureShadowSlipForEvaluation(original).hash !== hash) {
      throw new RangeError("Shadow slip history changed or was unavailable at evaluation time.");
    }
    ids.add(capture.id);
    return { capture, outcome: outcome(capture, observations) };
  });
  return freezeEvidence({ version: "shadow-slip-evaluation-v1", mode: "shadow", productionQualified: false,
    asOf: input.asOf, sourceModes,
    originals: samples.map(({ capture, outcome }) => ({ id: capture.id, hash: capture.hash, outcome })),
    overall: summarize(samples), bands: bestSlipOddsBands.map(({ id }) => ({ band: id,
      metrics: summarize(samples.filter(sample => sample.capture.band === id)) })),
    limitations: ["Input provenance requires independent verification; a seal detects mutation, not fabricated history.",
      "Synthetic results do not demonstrate predictive accuracy.",
      "Illustrative returns use the captured two-decimal total quote, not an inferred bookmaker payout or unrounded per-leg product.",
      "Void, cancelled, pending and unavailable slips do not imply bookmaker refunds and are excluded from illustrative returns."] });
}
