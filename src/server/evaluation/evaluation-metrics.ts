import "server-only";

import { isMarketFamily, marketSelections, presentMarketProbabilities, validateMarketGroup,
  type AcceptedMarket, type MarketFamily } from "../../domain/markets.ts";
import { settleMarketSelection } from "../../domain/market-settlement.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import type { CalibrationBin, EvaluationMetrics, MetricObservation } from "./evaluation-contract.ts";

export class EvaluationMetricsError extends Error {
  readonly reason: "invalid-configuration" | "invalid-observation";
  constructor(reason: EvaluationMetricsError["reason"]) {
    super(reason === "invalid-configuration" ? "Evaluation metric configuration is invalid." : "Evaluation observation is invalid.");
    this.name = "EvaluationMetricsError"; this.reason = reason;
  }
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** Exact canonical decimal differences avoid rejecting a small underlying probability
 * because of intermediate binary subtraction of overlapping event probabilities. */
function resultProbabilities(market: Extract<AcceptedMarket, { family: "double-chance" }>) {
  const values = [market.probabilities["home-or-draw"], market.probabilities["away-or-draw"], market.probabilities["home-or-away"]];
  const decimals = values.map((value) => {
    const [coefficient = "0", exponent = "0"] = String(value).split("e"), [whole = "0", fraction = ""] = coefficient.split(".");
    return { units: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...decimals.map((value) => value.scale));
  const [homeDraw, awayDraw, homeAway] = decimals.map((value) => value.units * 10n ** BigInt(scale - value.scale)) as [bigint, bigint, bigint];
  const half = (numerator: bigint) => {
    const signed = numerator < 0n ? "-" : "", digits = ((numerator < 0n ? -numerator : numerator) * 5n).toString().padStart(scale + 2, "0");
    return Number(`${signed}${digits.slice(0, -scale - 1)}.${digits.slice(-scale - 1)}`);
  };
  return { "home-win": half(homeDraw + homeAway - awayDraw), draw: half(homeDraw + awayDraw - homeAway),
    "away-win": half(awayDraw + homeAway - homeDraw) };
}
function assertMarket(family: MarketFamily, market: AcceptedMarket): void {
  try {
    if (!record(market) || market.family !== family || Object.keys(market).some((key) => !["ruleVersion", "family", "period", "source", "probabilities",
      "selection", "selectedProbability", ...(family === "total-goals" ? ["line"] : []), ...(family === "double-chance" ? ["derivedFrom"] : [])].includes(key))) throw new Error();
    presentMarketProbabilities(market);
    const checked = validateMarketGroup(family === "double-chance" ? "match-result" : family, {
      source: market.source, period: market.period, probabilities: market.family === "double-chance" ? resultProbabilities(market) : market.probabilities,
      ...(market.family === "total-goals" ? { line: market.line } : {}),
    });
    if (!checked.valid) throw new Error();
  } catch { throw new EvaluationMetricsError("invalid-observation"); }
}
function wilson(successes: number, count: number, z: number): Readonly<{ lower: number; upper: number }> {
  // Divide by z before squaring when z is large, preserving a finite result
  // without clipping the caller's explicit confidence parameter.
  const p = successes / count, scale = Math.max(1, z), scaledZ = z / scale, inverseScale = 1 / scale;
  const denominator = inverseScale ** 2 + scaledZ ** 2 / count;
  const center = (p * inverseScale ** 2 + scaledZ ** 2 / (2 * count)) / denominator;
  const margin = scaledZ * Math.sqrt(p * (1 - p) * inverseScale ** 2 / count + scaledZ ** 2 / (4 * count ** 2)) / denominator;
  return Object.freeze({ lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) });
}

/** Scores settled regulation outcomes using the stored distribution as supplied.
 * Double chance averages three overlapping binary events per fixture; the selected
 * pick and headline count still contribute only once. Provenance is owned by the harness. */
export function evaluateMarketMetrics(family: MarketFamily, observations: readonly MetricObservation[], bands: readonly number[], confidenceZ: number): EvaluationMetrics {
  if (!isMarketFamily(family) || !Array.isArray(observations) || !Array.isArray(bands) || bands.length < 2 || bands[0] !== 0 || bands.at(-1) !== 1 ||
    Array.from(bands).some((edge, index) => typeof edge !== "number" || !Number.isFinite(edge) || edge < 0 || edge > 1 || index > 0 && edge <= bands[index - 1]!) ||
    typeof confidenceZ !== "number" || !Number.isFinite(confidenceZ) || confidenceZ <= 0) throw new EvaluationMetricsError("invalid-configuration");
  const selections = marketSelections[family];
  const buckets = selections.flatMap((selection) => bands.slice(0, -1).map((lower, index) => ({ selection, lower, upper: bands[index + 1]!, count: 0, probability: 0, successes: 0 })));
  let count = 0, correct = 0, brierTotal = 0, logLossTotal = 0;
  for (const observation of observations) {
    const input: unknown = observation;
    if (!record(input) || Object.keys(input).some((key) => !["market", "result"].includes(key)) || !record(input.result))
      throw new EvaluationMetricsError("invalid-observation");
    assertMarket(family, observation.market);
    const selected = settleMarketSelection(family, observation.market.selection, observation.result);
    if (selected.status !== "correct" && selected.status !== "incorrect") continue;
    const probabilities = observation.market.probabilities as Readonly<Record<string, number>>;
    let fixtureBrier = 0, fixtureLogLoss = 0;
    for (const [selectionIndex, selection] of selections.entries()) {
      const truth = settleMarketSelection(family, selection, observation.result);
      if (truth.status !== "correct" && truth.status !== "incorrect") throw new EvaluationMetricsError("invalid-observation");
      const actual = truth.status === "correct" ? 1 : 0, probability = probabilities[selection]!;
      fixtureBrier += (probability - actual) ** 2;
      if (family === "double-chance") fixtureLogLoss += actual === 1 ? -Math.log(probability) : -Math.log1p(-probability);
      else if (actual === 1) fixtureLogLoss = -Math.log(probability);
      let lower = 0, upper = bands.length - 1;
      while (lower + 1 < upper) { const middle = Math.floor((lower + upper) / 2); if (probability < bands[middle]!) upper = middle; else lower = middle; }
      const bin = buckets[selectionIndex * (bands.length - 1) + lower]!;
      bin.count++; bin.probability += probability; bin.successes += actual;
    }
    count++; if (selected.status === "correct") correct++;
    brierTotal += family === "match-result" ? fixtureBrier : fixtureBrier / selections.length;
    logLossTotal += family === "double-chance" ? fixtureLogLoss / selections.length : fixtureLogLoss;
  }
  const calibration: CalibrationBin[] = buckets.map((bin) => ({ selection: bin.selection, lower: bin.lower, upper: bin.upper, count: bin.count,
    meanProbability: bin.count === 0 ? null : bin.probability / bin.count, observedFrequency: bin.count === 0 ? null : bin.successes / bin.count,
    interval: bin.count === 0 ? null : wilson(bin.successes, bin.count, confidenceZ) }));
  const calibrationError = count === 0 ? null : selections.reduce((sum, selection) => sum + calibration.filter((bin) => bin.selection === selection)
    .reduce((weighted, bin) => weighted + bin.count / count * Math.abs((bin.observedFrequency ?? 0) - (bin.meanProbability ?? 0)), 0), 0) / selections.length;
  return freezeEvidence({ count, correct, incorrect: count - correct, hitRate: count === 0 ? null : correct / count,
    brier: count === 0 ? null : brierTotal / count, logLoss: count === 0 ? null : logLossTotal / count, calibrationError, calibration });
}
