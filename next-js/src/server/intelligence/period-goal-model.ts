import "server-only";

import { parseScoreDistribution, scoreDistributionRules, type ScoreState } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import type { IntelligenceFixture, LocalGoalInput } from "./intelligence-contract.ts";

export const PERIOD_GOAL_MODEL_VERSION = "conditional-half-score-v1";

export type PeriodGoalHistory = LocalGoalInput["history"][number] & Readonly<{
  halfTime: Readonly<{ home: number; away: number }> | null;
}>;

type PeriodScore = Readonly<{ home: number; away: number; count: number }>;
type Scoreline = PeriodScore & Readonly<{ halves: readonly PeriodScore[] }>;
type FitPolicy = Readonly<{ minimumScorelineSamples: number; lookbackMs: number }>;
type ReliabilityBin = Readonly<{
  lower: number; upper: number; count: number; meanProbability: number | null; observedFrequency: number | null;
}>;

export type PeriodGoalArtifact = Readonly<{
  version: typeof PERIOD_GOAL_MODEL_VERSION;
  hash: string;
  mode: "synthetic" | "historical" | "prospective";
  competitionId: string;
  fittedAt: number;
  validationStartsAt: number;
  policy: FitPolicy;
  scorelines: readonly Scoreline[];
  training: Readonly<{ verifiedResults: number; verifiedPairs: number; observationHashes: readonly string[] }>;
  validation: Readonly<{
    basis: "half-score-conditional-on-observed-regulation-score";
    verifiedResults: number; missingPairs: number; unsupportedScorelines: number; evaluated: number;
    coverage: number | null; brier: number | null; logLoss: number | null; zeroProbabilityResults: number;
    reliability: readonly ReliabilityBin[]; observationHashes: readonly string[];
  }>;
}>;

type FitResult = Readonly<{ status: "fitted"; artifact: PeriodGoalArtifact }> | Readonly<{
  status: "unavailable"; reason: "invalid-period-fit" | "conflicting-period-history" | "insufficient-paired-period-history";
}>;

const maxHistoryRows = 100_000;
const reliabilityEdges = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
const emptyScoreline: Scoreline = { home: 0, away: 0, count: 1, halves: [{ home: 0, away: 0, count: 1 }] };
const scoreKey = (home: number, away: number) => `${home}:${away}`;
const stableScoreOrder = (a: Pick<PeriodScore, "home" | "away">, b: Pick<PeriodScore, "home" | "away">) => a.home - b.home || a.away - b.away;
const isGoalCount = (value: number) => Number.isInteger(value) && value >= 0 && value <= scoreDistributionRules.maximumGoals;

function validHistory(row: PeriodGoalHistory): boolean {
  return !!row.fixtureId && !!row.homeTeamId && !!row.awayTeamId && row.homeTeamId !== row.awayTeamId &&
    row.period === "regulation-including-stoppage-time" && Number.isSafeInteger(row.kickoffAt) &&
    Number.isSafeInteger(row.availableAt) && row.availableAt > row.kickoffAt && !!row.evidenceRef &&
    /^[a-f0-9]{64}$/u.test(row.observationHash) && isGoalCount(row.homeGoals) && isGoalCount(row.awayGoals) &&
    (row.halfTime === null || !!row.halfTime && isGoalCount(row.halfTime.home) && isGoalCount(row.halfTime.away) &&
      row.halfTime.home <= row.homeGoals && row.halfTime.away <= row.awayGoals);
}

function currentHistory(rows: readonly PeriodGoalHistory[]): PeriodGoalHistory[] | null {
  const byFixture = new Map<string, PeriodGoalHistory>();
  const byObservation = new Map<string, string>();
  const clocks = new Map<string, string>();
  for (const row of rows) {
    const fingerprint = evidenceFingerprint({ fixtureId: row.fixtureId, competitionId: row.competitionId, homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId, kickoffAt: row.kickoffAt, availableAt: row.availableAt, homeGoals: row.homeGoals,
      awayGoals: row.awayGoals, halfTime: row.halfTime, evidenceRef: row.evidenceRef });
    const sameObservation = byObservation.get(row.observationHash);
    const clock = `${row.fixtureId}:${row.availableAt}`, sameClock = clocks.get(clock);
    const previous = byFixture.get(row.fixtureId);
    if (sameObservation && sameObservation !== fingerprint || sameClock && sameClock !== fingerprint ||
      previous && (previous.kickoffAt !== row.kickoffAt || previous.homeTeamId !== row.homeTeamId || previous.awayTeamId !== row.awayTeamId)) return null;
    byObservation.set(row.observationHash, fingerprint);
    clocks.set(clock, fingerprint);
    if (!previous || row.availableAt > previous.availableAt) byFixture.set(row.fixtureId, row);
  }
  return [...byFixture.values()];
}

function fitScorelines(rows: readonly PeriodGoalHistory[], minimumSamples: number): Scoreline[] {
  const scorelines = new Map<string, { home: number; away: number; count: number; halves: Map<string, PeriodScore> }>();
  for (const { homeGoals: home, awayGoals: away, halfTime } of rows) {
    if (halfTime === null || home === 0 && away === 0) continue;
    const key = scoreKey(home, away);
    const full = scorelines.get(key) ?? { home, away, count: 0, halves: new Map() };
    const halfKey = scoreKey(halfTime.home, halfTime.away), half = full.halves.get(halfKey);
    full.count++;
    full.halves.set(halfKey, { ...halfTime, count: (half?.count ?? 0) + 1 });
    scorelines.set(key, full);
  }
  return [...scorelines.values()].filter(({ count }) => count >= minimumSamples).sort(stableScoreOrder)
    .map(({ halves, ...full }) => ({ ...full, halves: [...halves.values()].sort(stableScoreOrder) }));
}

function evaluateConditionalHoldout(rows: readonly PeriodGoalHistory[], scorelines: readonly Scoreline[]): PeriodGoalArtifact["validation"] {
  const byScore = new Map([...scorelines, emptyScoreline].map((line) => [scoreKey(line.home, line.away), line]));
  const bins = reliabilityEdges.slice(0, -1).map((lower, index) => ({
    lower, upper: reliabilityEdges[index + 1]!, count: 0, probability: 0, correct: 0,
  }));
  let missingPairs = 0, unsupportedScorelines = 0, evaluated = 0, brier = 0, logLoss = 0, zeroProbabilityResults = 0;
  for (const { homeGoals, awayGoals, halfTime } of rows) {
    if (halfTime === null) { missingPairs++; continue; }
    const fitted = byScore.get(scoreKey(homeGoals, awayGoals));
    if (!fitted) { unsupportedScorelines++; continue; }
    const { count, halves } = fitted;
    const winner = halves.find((half) => half.home === halfTime.home && half.away === halfTime.away);
    const top = halves.reduce((best, half) => half.count > best.count ? half : best);
    const probability = (winner?.count ?? 0) / count, topProbability = top.count / count;
    brier += halves.reduce((sum, half) => sum + (half.count / count) ** 2, 1 - 2 * probability);
    if (probability > 0) logLoss -= Math.log(probability);
    else zeroProbabilityResults++;
    const bin = bins.find(({ upper }) => topProbability < upper) ?? bins.at(-1)!;
    bin.count++;
    bin.probability += topProbability;
    bin.correct += Number(top === winner);
    evaluated++;
  }
  return { basis: "half-score-conditional-on-observed-regulation-score", verifiedResults: rows.length, missingPairs, unsupportedScorelines, evaluated,
    coverage: rows.length ? evaluated / rows.length : null, brier: evaluated ? brier / evaluated : null,
    logLoss: evaluated && zeroProbabilityResults === 0 ? logLoss / evaluated : null, zeroProbabilityResults,
    reliability: bins.map(({ lower, upper, count, probability, correct }) => ({ lower, upper, count,
      meanProbability: count ? probability / count : null, observedFrequency: count ? correct / count : null })),
    observationHashes: rows.map((row) => row.observationHash).sort() };
}

/** Fits only on the result versions known at the start of a separate chronological
 * holdout. Validation conditions on the realized regulation score and therefore
 * does not qualify an end-to-end half-market forecast. */
export function fitPeriodGoalModel(input: Readonly<{
  competitionId: string; mode: PeriodGoalArtifact["mode"]; validationStartsAt: number; fittedAt: number;
  policy: FitPolicy; history: readonly PeriodGoalHistory[]; verifyHistory(row: PeriodGoalHistory): boolean;
}>): FitResult {
  const { competitionId, mode, validationStartsAt, fittedAt, policy, history, verifyHistory } = input;
  if (!competitionId || !["synthetic", "historical", "prospective"].includes(mode) || ![validationStartsAt, fittedAt].every(Number.isSafeInteger) ||
    validationStartsAt >= fittedAt || !Number.isSafeInteger(policy.lookbackMs) || policy.lookbackMs <= 0 ||
    !Number.isSafeInteger(policy.minimumScorelineSamples) || policy.minimumScorelineSamples < 2 || history.length > maxHistoryRows)
    return { status: "unavailable", reason: "invalid-period-fit" };
  const scope = history.filter((row) => row.competitionId === competitionId && row.kickoffAt >= validationStartsAt - policy.lookbackMs &&
    row.availableAt <= fittedAt && validHistory(row) && provenTrue(() => verifyHistory(row)));
  const training = currentHistory(scope.filter((row) => row.kickoffAt < validationStartsAt && row.availableAt < validationStartsAt));
  const holdout = currentHistory(scope.filter((row) => row.kickoffAt >= validationStartsAt));
  const trainedFixtures = new Set(training?.map((row) => row.fixtureId));
  const trainedObservations = new Set(training?.map((row) => row.observationHash));
  if (!training || !holdout || holdout.some((row) => trainedFixtures.has(row.fixtureId) || trainedObservations.has(row.observationHash)))
    return { status: "unavailable", reason: "conflicting-period-history" };
  const scorelines = fitScorelines(training, policy.minimumScorelineSamples);
  if (!scorelines.length) return { status: "unavailable", reason: "insufficient-paired-period-history" };
  const paired = training.filter((row) => row.halfTime !== null);
  const contents = { version: PERIOD_GOAL_MODEL_VERSION, mode, competitionId, fittedAt, validationStartsAt, policy: { ...policy }, scorelines,
    training: { verifiedResults: training.length, verifiedPairs: paired.length, observationHashes: paired.map((row) => row.observationHash).sort() },
    validation: evaluateConditionalHoldout(holdout, scorelines) } as const;
  return { status: "fitted", artifact: freezeEvidence({ ...contents, hash: evidenceFingerprint(contents) }) };
}

/** Preserves every regulation score marginal and all explicit tail mass. A full
 * score without a supported allocation keeps its original unknown half state. */
export function applyPeriodGoalModel(input: Readonly<{
  artifact: PeriodGoalArtifact; fixture: Pick<IntelligenceFixture, "competitionId" | "forecastAt" | "kickoffAt">;
  regulationDistribution: unknown; verifyArtifact(artifact: PeriodGoalArtifact): boolean;
}>) {
  const { artifact, fixture, regulationDistribution, verifyArtifact } = input;
  if (artifact.version !== PERIOD_GOAL_MODEL_VERSION || artifact.competitionId !== fixture.competitionId ||
    ![fixture.forecastAt, fixture.kickoffAt, artifact.fittedAt].every(Number.isSafeInteger) ||
    fixture.forecastAt < artifact.fittedAt || fixture.forecastAt >= fixture.kickoffAt || !provenTrue(() => verifyArtifact(artifact)))
    return { status: "unavailable", reason: "unverified-or-out-of-scope-period-artifact" } as const;
  const { hash, ...body } = artifact;
  if (evidenceFingerprint(body) !== hash) return { status: "unavailable", reason: "invalid-period-artifact" } as const;
  let regulation;
  try { regulation = parseScoreDistribution(regulationDistribution); }
  catch { return { status: "unavailable", reason: "invalid-regulation-distribution" } as const; }
  if (regulation.states.some((state) => state.halfHome !== null))
    return { status: "unavailable", reason: "regulation-distribution-already-has-period-scores" } as const;
  const byScore = new Map([...artifact.scorelines, emptyScoreline].map((line) => [scoreKey(line.home, line.away), line]));
  const states: ScoreState[] = [];
  let availableStates = scoreDistributionRules.maximumStates - regulation.states.length, unknownHalfProbability = 0, limitedByStateCount = false;
  const largestFirst = [...regulation.states].sort((a, b) => b.probability - a.probability || stableScoreOrder(a, b));
  for (const state of largestFirst) {
    const line = byScore.get(scoreKey(state.home, state.away));
    const additionalStates = (line?.halves.length ?? 0) - 1;
    if (!line || additionalStates > availableStates) {
      states.push(state);
      unknownHalfProbability += state.probability;
      limitedByStateCount ||= !!line;
      continue;
    }
    availableStates -= additionalStates;
    for (const half of line.halves) states.push({ ...state, halfHome: half.home, halfAway: half.away,
      probability: state.probability * (half.count / line.count) });
  }
  try {
    const evidence = artifact.validation.evaluated ? "conditional-holdout-only" : "no-conditional-holdout";
    return freezeEvidence({ status: "estimated", evidence, modelHash: hash,
      distribution: parseScoreDistribution({ ...regulation, states }), diagnostics: { unknownHalfProbability, limitedByStateCount,
        unresolvedProbability: Math.min(1, unknownHalfProbability + regulation.unrepresentedProbability) } } as const);
  } catch { return { status: "unavailable", reason: "invalid-period-distribution" } as const; }
}
