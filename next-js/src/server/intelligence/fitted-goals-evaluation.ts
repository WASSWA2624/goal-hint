import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketRules, sourceGroups, validateMarketSnapshot, type MarketFamily } from "../../domain/markets.ts";
import { parseScoreDistribution, SCORE_DISTRIBUTION_VERSION, scoreDistributionRules, type ScoreDistribution } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { createMarketMetricsAccumulator } from "../evaluation/evaluation-metrics.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { FITTED_GOALS_MODEL_VERSION, fitCompetitionGoalModel, scoreFittedCompetitionGoals, type FittedGoalHistoryRow } from "./fitted-goals-model.ts";
import type { IntelligenceProbabilities } from "./intelligence-contract.ts";
import { localGoalDefaults } from "./local-goals-model.ts";
import type { WalkForwardFixture } from "./walk-forward-evaluation.ts";

const families = ["match-result", "double-chance", "total-goals", "both-teams-to-score"] as const;
const systems = ["independent", "low-score-corrected", "calibrated"] as const;
const bins = [0, 0.2, 0.4, 0.6, 0.8, 1];
const modelWeights = [0.5, 0.65, 0.8, 0.9, 1] as const;
const minimumCalibrationMatches = 50;
const scoreProbabilityFloor = 1e-12;
const lockLeadMs = 5 * 60_000;
const instant = z.number().int().min(0).max(253_402_300_799_999);
const windowsSchema = z.strictObject({ validationFrom: instant, calibrationFrom: instant, finalTestFrom: instant, finalTestUntil: instant })
  .refine(({ validationFrom, calibrationFrom, finalTestFrom, finalTestUntil }) =>
    validationFrom < calibrationFrom && calibrationFrom < finalTestFrom && finalTestFrom < finalTestUntil);

export type FittedGoalHoldouts = Readonly<z.infer<typeof windowsSchema>>;
type GoalSystem = typeof systems[number];
type Candidate = Readonly<{ distribution: ScoreDistribution; probabilities: IntelligenceProbabilities }>;
type CalibrationArtifact = Readonly<{ version: "goal-score-pooling-v1"; fitThrough: number; samples: number;
  modelWeight: typeof modelWeights[number]; sampleHash: string; hash: string }>;

const keyOf = (home: number, away: number) => `${home}:${away}`;

function leagueScorePrior(history: readonly FittedGoalHistoryRow[], asOf: number): ScoreDistribution | null {
  const scores = new Map<string, { home: number; away: number; weight: number }>();
  let totalWeight = 0;
  for (const { homeGoals: home, awayGoals: away, kickoffAt } of history) {
    if (Math.max(home, away) > scoreDistributionRules.maximumGoals) continue;
    const weight = Math.exp(-Math.LN2 * (asOf - kickoffAt) / localGoalDefaults.halfLifeMs);
    const key = keyOf(home, away), previous = scores.get(key);
    scores.set(key, { home, away, weight: (previous?.weight ?? 0) + weight });
    totalWeight += weight;
  }
  if (!totalWeight || scores.size > scoreDistributionRules.maximumStates) return null;
  return parseScoreDistribution({ version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0,
    states: [...scores.values()].map(({ home, away, weight }) => ({ home, away, halfHome: null, halfAway: null, probability: weight / totalWeight })) });
}

/** Calibrate by pooling entire score distributions so nested and overlapping markets remain coherent. */
export function applyGoalScoreCalibration(model: ScoreDistribution, prior: ScoreDistribution, weight: number): Candidate | null {
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) return null;
  const scores = new Map<string, { home: number; away: number; halfHome: null; halfAway: null; probability: number }>();
  for (const [input, share] of [[model, weight], [prior, 1 - weight]] as const) {
    if (share === 0) continue;
    for (const { home, away, probability } of input.states) {
      const key = keyOf(home, away), previous = scores.get(key);
      scores.set(key, { home, away, halfHome: null, halfAway: null, probability: (previous?.probability ?? 0) + probability * share });
    }
  }
  if (!scores.size || scores.size > scoreDistributionRules.maximumStates) return null;
  const unrepresentedProbability = model.unrepresentedProbability * weight + prior.unrepresentedProbability * (1 - weight);
  const distribution = parseScoreDistribution({ version: SCORE_DISTRIBUTION_VERSION, states: [...scores.values()], unrepresentedProbability });
  const represented = 1 - unrepresentedProbability;
  if (represented <= 0 || unrepresentedProbability >= 1e-6) return null;
  let homeWin = 0, draw = 0, awayWin = 0, over = 0, yes = 0;
  for (const { home, away, probability } of distribution.states) {
    const p = probability / represented;
    if (home > away) homeWin += p;
    else if (home === away) draw += p;
    else awayWin += p;
    if (home + away > 2) over += p;
    if (home > 0 && away > 0) yes += p;
  }
  return freezeEvidence({ distribution, probabilities: { "match-result": { "home-win": homeWin, draw, "away-win": awayWin },
    "double-chance": { "home-or-draw": homeWin + draw, "away-or-draw": awayWin + draw, "home-or-away": homeWin + awayWin },
    "total-goals": { "over-2.5": over, "under-2.5": 1 - over }, "both-teams-to-score": { yes, no: 1 - yes } } });
}

function learningRows(rows: readonly FittedGoalHistoryRow[], competitionId: string, asOf: number) {
  return rows.filter(row => row.competitionId === competitionId && row.kickoffAt < asOf &&
    row.availableAt <= asOf && row.kickoffAt >= asOf - localGoalDefaults.lookbackMs);
}

function calibrate(learnedAt: number, samples: readonly { id: string; resultAvailableAt: number; home: number; away: number;
  model: ScoreDistribution; prior: ScoreDistribution }[]): CalibrationArtifact | null {
  const earlier = samples.filter(row => row.resultAvailableAt < learnedAt);
  if (earlier.length < minimumCalibrationMatches) return null;
  const scoreAt = (distribution: ScoreDistribution, home: number, away: number) =>
    distribution.states.find(state => state.home === home && state.away === away)?.probability ?? 0;
  const losses = modelWeights.map(modelWeight => ({ modelWeight, loss: earlier.reduce((sum, row) => {
    const probability = modelWeight * scoreAt(row.model, row.home, row.away) + (1 - modelWeight) * scoreAt(row.prior, row.home, row.away);
    return sum - Math.log(Math.max(scoreProbabilityFloor, probability));
  }, 0) }));
  losses.sort((a, b) => a.loss - b.loss || b.modelWeight - a.modelWeight);
  const body = { version: "goal-score-pooling-v1" as const, fitThrough: learnedAt, samples: earlier.length,
    modelWeight: losses[0]!.modelWeight, sampleHash: evidenceFingerprint(earlier.map(row => row.id)) };
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

function resolvedResult(entry: WalkForwardFixture, verifyHistory: (row: FittedGoalHistoryRow) => boolean) {
  const { fixture, result } = entry;
  if (entry.status !== "settled") return null;
  if (!result || result.fixtureId !== fixture.fixtureId || result.competitionId !== fixture.competitionId ||
    result.homeTeamId !== fixture.homeTeamId || result.awayTeamId !== fixture.awayTeamId || result.kickoffAt !== fixture.kickoffAt ||
    !Number.isSafeInteger(result.availableAt) || result.availableAt < result.kickoffAt || result.period !== marketRules.period ||
    ![result.homeGoals, result.awayGoals].every(score => Number.isInteger(score) && score >= 0 && score <= 100) ||
    !provenTrue(() => verifyHistory(result))) throw new Error("Unverified fitted-goal evaluation result.");
  return result;
}

function metricCells() {
  return new Map(systems.map(system => [system, new Map<MarketFamily, ReturnType<typeof createMarketMetricsAccumulator>>(
    families.map(family => [family, createMarketMetricsAccumulator(family, bins, 1.96)]))]));
}

/** Fit at each pre-recorded block boundary and reuse that artifact throughout the block. Holdout labels cannot tune earlier blocks. */
export function evaluateFittedGoalHoldouts(input: Readonly<{ mode: "synthetic" | "historical" | "prospective";
  holdouts: FittedGoalHoldouts; history: readonly FittedGoalHistoryRow[]; fixtures: readonly WalkForwardFixture[];
  verifyHistory(row: FittedGoalHistoryRow): boolean }>) {
  const windows = windowsSchema.parse(input.holdouts);
  if (!["synthetic", "historical", "prospective"].includes(input.mode) || input.history.length > 100_000 || input.fixtures.length > 10_000)
    throw new Error("Invalid fitted-goal evaluation input.");
  const seen = new Set<string>(), corpus = new Map<string, FittedGoalHistoryRow>();
  for (const row of input.history) {
    if (corpus.has(row.fixtureId) || !provenTrue(() => input.verifyHistory(row))) throw new Error("Unverified or duplicate fitted-goal history.");
    corpus.set(row.fixtureId, row);
  }
  const fixtures = input.fixtures.map(entry => {
    const { fixtureId, forecastAt, kickoffAt } = entry.fixture;
    if (!["settled", "pending", "void", "cancelled", "unavailable"].includes(entry.status) ||
      !instant.safeParse(forecastAt).success || !instant.safeParse(kickoffAt).success || forecastAt >= kickoffAt - lockLeadMs || seen.has(fixtureId))
      throw new Error("Invalid or duplicate fitted-goal evaluation fixture.");
    seen.add(fixtureId);
    const result = resolvedResult(entry, input.verifyHistory);
    if (result) {
      const previous = corpus.get(fixtureId);
      if (previous && (previous.observationHash !== result.observationHash || previous.availableAt !== result.availableAt))
        throw new Error("Conflicting fitted-goal evaluation result.");
      if (!previous) corpus.set(fixtureId, result);
    }
    return { ...entry, result };
  }).sort((a, b) => a.fixture.forecastAt - b.fixture.forecastAt || a.fixture.fixtureId.localeCompare(b.fixture.fixtureId));
  const history = [...corpus.values()].sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId));
  const blocks = [["validation", windows.validationFrom, windows.calibrationFrom], ["calibration", windows.calibrationFrom, windows.finalTestFrom],
    ["finalTest", windows.finalTestFrom, windows.finalTestUntil]] as const;
  const competitions = [...new Set(fixtures.filter(({ fixture }) => fixture.forecastAt >= windows.validationFrom &&
    fixture.forecastAt < windows.finalTestUntil).map(({ fixture }) => fixture.competitionId))].sort();
  const cohorts = competitions.map(competitionId => {
    const calibrationSamples: Parameters<typeof calibrate>[1][number][] = [];
    let calibration: CalibrationArtifact | null = null;
    const folds = [];
    for (const [phase, from, to] of blocks) {
      if (phase === "finalTest") calibration = calibrate(from, calibrationSamples);
      const training = learningRows(history, competitionId, from);
      const fit = fitCompetitionGoalModel({ competitionId, asOf: utcInstantFromEpochMilliseconds(from), history: training });
      const prior = leagueScorePrior(training, from);
      const holdout = fixtures.filter(({ fixture }) => fixture.competitionId === competitionId && fixture.forecastAt >= from && fixture.forecastAt < to);
      const metrics = metricCells();
      const available: Record<GoalSystem, number> = { independent: 0, "low-score-corrected": 0, calibrated: 0 };
      const reasons: Record<string, number> = {};
      if (fit.status !== "fitted" && holdout.length) reasons[fit.reason] = holdout.length;
      for (const { fixture, result } of holdout) {
        if (fit.status !== "fitted") break;
        const corrected = scoreFittedCompetitionGoals(fit.artifact, fixture);
        if (corrected.status !== "scored") { reasons[corrected.reason] = (reasons[corrected.reason] ?? 0) + 1; continue; }
        const independent = scoreFittedCompetitionGoals(fit.artifact, fixture, { lowScoreCorrection: false });
        const candidates = { independent: independent.status === "scored" ? independent : null, "low-score-corrected": corrected,
          calibrated: calibration && prior ? applyGoalScoreCalibration(corrected.distribution, prior, calibration.modelWeight) : null };
        if (phase === "calibration" && result && prior) calibrationSamples.push({ id: result.observationHash, resultAvailableAt: result.availableAt,
          home: result.homeGoals, away: result.awayGoals, model: corrected.distribution, prior });
        for (const system of systems) {
          const candidate = candidates[system];
          if (!candidate) continue;
          const snapshot = validateMarketSnapshot(Object.fromEntries(sourceGroups.map(family => [family, { source: "local-engine", period: marketRules.period,
            probabilities: candidate.probabilities[family], ...(family === "total-goals" ? { line: 2.5 } : {}) }])));
          if (families.some(family => !snapshot.markets[family].available)) continue;
          available[system]++;
          if (!result) continue;
          for (const family of families) {
            const market = snapshot.markets[family];
            if (market.available) metrics.get(system)!.get(family)!.add([{ market: market.market, result: { status: "finished-regulation",
              cycleEligibility: { eligible: true }, regulationScore: { verified: true, period: marketRules.period,
                home: result.homeGoals, away: result.awayGoals } } }]);
          }
        }
      }
      folds.push({ phase, from, to, training: training.length, trainingHash: evidenceFingerprint(training.map(row => row.observationHash)),
        fitStatus: fit.status, modelHash: fit.status === "fitted" ? fit.artifact.hash : null, fixtures: holdout.length,
        settled: holdout.filter(({ result }) => result !== null).length, abstentionReasons: reasons,
        systems: Object.fromEntries(systems.map(system => [system, { available: available[system], abstained: holdout.length - available[system],
          coverage: holdout.length ? available[system] / holdout.length : null,
          markets: Object.fromEntries(families.map(family => [family, metrics.get(system)!.get(family)!.snapshot()])) }])) });
    }
    return { competitionId, folds, calibration };
  });
  const report = { version: "fitted-goals-chronological-v1", modelVersion: FITTED_GOALS_MODEL_VERSION, mode: input.mode,
    windows, minimumCalibrationMatches, cohorts,
    approvedForPublication: false, predictiveAccuracyEstablished: false };
  return freezeEvidence({ ...report, hash: evidenceFingerprint(report) });
}
