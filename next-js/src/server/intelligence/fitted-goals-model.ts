import "server-only";

import { z } from "zod";
import { marketRules } from "../../domain/markets.ts";
import { GOAL_DERIVATION_TAIL_BOUND } from "../../domain/score-distribution-markets.ts";
import { parseScoreDistribution, SCORE_DISTRIBUTION_VERSION, type ScoreDistribution } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { IntelligenceFixture, IntelligenceProbabilities, LocalGoalConfiguration } from "./intelligence-contract.ts";
import { fitGoalRates, goalFitRates, parseLocalGoalConfiguration, poisson, supportedGoalRate,
  weightLocalGoalHistory, type GoalTrainingRow } from "./local-goals-fit.ts";
import { goalProbabilities } from "./local-goals-model.ts";

export const FITTED_GOALS_MODEL_VERSION = "regularized-dixon-coles-v1";
export const FITTED_GOALS_TAIL_BOUND = GOAL_DERIVATION_TAIL_BOUND;
const maximumRows = 100_000;
const maximumGoals = 21;
const rhoBounds = { min: -0.999 / 6, max: 0.999 / 36 };
const forecastLockMs = 5 * 60_000;
const id = z.string().min(1).max(512);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative().max(maximumRows);
const goalCount = z.number().int().nonnegative().max(100);
const weight = z.number().nonnegative().max(maximumRows);
const orderIds = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const trainingRowSchema = z.object({
  fixtureId: id, competitionId: id, homeTeamId: id, awayTeamId: id, kickoffAt: timestamp, availableAt: timestamp,
  homeGoals: goalCount, awayGoals: goalCount, period: z.literal(marketRules.period),
  observationHash: digest, evidenceRef: id, neutralVenue: z.boolean().optional(),
}).refine((row) => row.homeTeamId !== row.awayTeamId && row.availableAt >= row.kickoffAt);
const fixtureSchema = z.object({
  fixtureId: id, competitionId: id, homeTeamId: id, awayTeamId: id, forecastAt: timestamp, kickoffAt: timestamp,
  cohort: z.enum(["men", "women", "unspecified"]).optional(), neutralVenue: z.boolean().optional(),
}).refine((fixture) => fixture.homeTeamId !== fixture.awayTeamId);
const positive = z.number().positive();
const configurationSchema = z.strictObject({
  lookbackMs: positive, halfLifeMs: positive, minimumMatches: positive, minimumTeamMatches: positive,
  ridge: positive, maximumIterations: positive, tolerance: positive,
});
const teamSchema = z.strictObject({
  teamId: id, attack: z.number(), defense: z.number(), componentId: id, effectiveMatches: weight,
});
const artifactSchema = z.strictObject({
  version: z.string(), competitionId: id, asOf: timestamp, configuration: configurationSchema,
  baseline: z.number(), homeAdvantage: z.number(), rho: z.number().min(rhoBounds.min).max(rhoBounds.max),
  teams: z.array(teamSchema).min(2).max(2 * maximumRows),
  training: z.strictObject({
    historyHash: digest, matches: count.positive(), effectiveMatches: weight,
    firstKickoffAt: timestamp, lastKickoffAt: timestamp, lowScoreMatches: count, effectiveNeutralMatches: weight,
    iterations: z.number().int().positive().max(5000),
  }),
  hash: digest,
});

export type FittedGoalHistoryRow = GoalTrainingRow;
export type FittedGoalFixture = IntelligenceFixture & Readonly<{ neutralVenue?: boolean }>;
type Artifact = z.infer<typeof artifactSchema>;
export type FittedGoalModel = Readonly<Omit<Artifact, "teams" | "training"> & {
  teams: readonly Readonly<Artifact["teams"][number]>[]; training: Readonly<Artifact["training"]>;
}>;
type FitWithholding = "invalid-fit-input" | "ambiguous-result-observation" | "insufficient-competition-history" |
  "optimization-failed" | "optimization-not-converged";
export type FittedGoalFitResult = Readonly<{ status: "fitted"; artifact: FittedGoalModel }> |
  Readonly<{ status: "withheld"; reason: FitWithholding }>;
type ScoreWithholding = "invalid-fitted-model" | "invalid-fixture" | "wrong-competition" | "forecast-locked" |
  "artifact-from-future" | "expired-fitted-model" | "insufficient-team-history" | "disconnected-team-history" |
  "unsupported-goal-rate" | "unrepresented-score-mass";
export type FittedGoalScoreResult = Readonly<{
  status: "scored"; artifactHash: string; modelVersion: string; rho: number;
  dependence: "dixon-coles" | "independent";
  expectedGoals: Readonly<{ home: number; away: number }>;
  distribution: ScoreDistribution; probabilities: IntelligenceProbabilities;
  evidence: Readonly<{
    competitionEffectiveMatches: number; homeEffectiveMatches: number; awayEffectiveMatches: number;
    uncertainty: "high" | "moderate"; support: "competition-prior" | "connected-team-history";
    connectedTeamHistory: boolean; usesSparsePrior: boolean; eligibleForPublication: false;
    reason: "uncalibrated-fitted-model";
    venue: "verified-neutral" | "verified-home" | "home-designation";
  }>;
}> | Readonly<{ status: "withheld"; reason: ScoreWithholding }>;

const teamIndexes = new WeakMap<FittedGoalModel, ReadonlyMap<string, FittedGoalModel["teams"][number]>>();

export function fittedGoalModelVersion(configuration?: Partial<LocalGoalConfiguration>): string {
  return `${FITTED_GOALS_MODEL_VERSION}:${evidenceFingerprint(parseLocalGoalConfiguration(configuration)).slice(0, 16)}`;
}

function registerArtifact(artifact: FittedGoalModel): FittedGoalModel {
  const frozen = freezeEvidence(artifact);
  teamIndexes.set(frozen, new Map(frozen.teams.map((team) => [team.teamId, team])));
  return frozen;
}

/** Reload a snapshot after checking its schema, version and content identity. */
export function parseFittedGoalModel(input: unknown): FittedGoalModel | null {
  if (input && typeof input === "object" && teamIndexes.has(input as FittedGoalModel)) return input as FittedGoalModel;
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) return null;
  const { hash, ...body } = parsed.data;
  const { training, teams, asOf, configuration } = body;
  try {
    if (body.version !== fittedGoalModelVersion(configuration)) return null;
  } catch { return null; }
  if (training.effectiveMatches < configuration.minimumMatches || training.effectiveMatches > training.matches ||
    training.firstKickoffAt < asOf - configuration.lookbackMs || training.firstKickoffAt > training.lastKickoffAt ||
    training.lastKickoffAt >= asOf || training.lowScoreMatches > training.matches || training.effectiveNeutralMatches > training.effectiveMatches ||
    training.iterations > configuration.maximumIterations || teams.length > training.matches * 2) return null;
  const representatives = new Set(teams.filter((team) => team.componentId === team.teamId).map((team) => team.teamId));
  if (teams.some((team, index) => !representatives.has(team.componentId) || team.effectiveMatches > training.effectiveMatches ||
    orderIds(team.componentId, team.teamId) > 0 || (index > 0 && orderIds(teams[index - 1]!.teamId, team.teamId) >= 0)) ||
    evidenceFingerprint(body) !== hash) return null;
  return registerArtifact(parsed.data);
}

function trainingComponents(
  teamIds: readonly string[], sample: readonly Readonly<{ row: FittedGoalHistoryRow; weight: number }>[],
): ReadonlyMap<string, string> {
  const parents = new Map(teamIds.map((teamId) => [teamId, teamId]));
  function root(teamId: string): string {
    let current = teamId;
    while (parents.get(current) !== current) {
      const parent = parents.get(current)!;
      const grandparent = parents.get(parent)!;
      parents.set(current, grandparent);
      current = grandparent;
    }
    return current;
  }
  for (const { row: { homeTeamId, awayTeamId }, weight } of sample) {
    if (weight === 0) continue;
    const home = root(homeTeamId), away = root(awayTeamId);
    if (orderIds(home, away) < 0) parents.set(away, home);
    else if (home !== away) parents.set(home, away);
  }
  return new Map(teamIds.map((teamId) => [teamId, root(teamId)]));
}

function equivalentGoals(left: FittedGoalHistoryRow, right: FittedGoalHistoryRow): boolean {
  return left.homeTeamId === right.homeTeamId && left.awayTeamId === right.awayTeamId && left.kickoffAt === right.kickoffAt &&
    left.homeGoals === right.homeGoals && left.awayGoals === right.awayGoals && left.neutralVenue === right.neutralVenue;
}

/** The coefficient of rho in the four Dixon–Coles correction factors. */
function correctionCoefficient(homeGoals: number, awayGoals: number, homeRate: number, awayRate: number): number {
  if (homeGoals === 0 && awayGoals === 0) return -homeRate * awayRate;
  if (homeGoals === 0 && awayGoals === 1) return homeRate;
  if (homeGoals === 1 && awayGoals === 0) return awayRate;
  return -1;
}

function estimateRho(
  sample: readonly Readonly<{ coefficient: number; weight: number }>[], ridge: number,
): number {
  if (sample.length === 0) return 0;
  // Fit the correction conditional on the Poisson rate fit. Shrink toward
  // independence and keep every supported fixture's correction positive.
  let lower = rhoBounds.min, upper = rhoBounds.max;
  for (const { coefficient } of sample) {
    if (coefficient > 0) lower = Math.max(lower, -0.999 / coefficient);
    if (coefficient < 0) upper = Math.min(upper, -0.999 / coefficient);
  }
  for (let iteration = 0; iteration < 48; iteration++) {
    const rho = (lower + upper) / 2;
    const derivative = sample.reduce((sum, entry) => sum + entry.weight * entry.coefficient / (1 + entry.coefficient * rho),
      -ridge * rho);
    if (derivative === 0) return rho;
    if (derivative > 0) lower = rho;
    else upper = rho;
  }
  return (lower + upper) / 2;
}

export function fitCompetitionGoalModel(input: Readonly<{
  competitionId: string; asOf: number; history: readonly FittedGoalHistoryRow[];
  configuration?: Partial<LocalGoalConfiguration>;
}>): FittedGoalFitResult {
  const withheld = (reason: FitWithholding): FittedGoalFitResult => ({ status: "withheld", reason });
  if (!input || !id.safeParse(input.competitionId).success || !timestamp.safeParse(input.asOf).success ||
    !Array.isArray(input.history) || input.history.length > maximumRows) return withheld("invalid-fit-input");
  let configuration: LocalGoalConfiguration;
  try { configuration = parseLocalGoalConfiguration(input.configuration); } catch { return withheld("invalid-fit-input"); }
  const { competitionId, asOf } = input;
  const versions = new Map<string, { row: FittedGoalHistoryRow; conflicting: boolean }>();
  for (const observation of input.history) {
    const parsed = trainingRowSchema.safeParse(observation);
    if (!parsed.success) return withheld("invalid-fit-input");
    const { neutralVenue, ...data } = parsed.data;
    const row: FittedGoalHistoryRow = { ...data, ...(neutralVenue === undefined ? {} : { neutralVenue }) };
    if (row.competitionId !== competitionId || row.kickoffAt >= asOf || row.kickoffAt < asOf - configuration.lookbackMs ||
      row.availableAt > asOf) continue;
    const prior = versions.get(row.fixtureId);
    if (!prior || row.availableAt > prior.row.availableAt) versions.set(row.fixtureId, { row, conflicting: false });
    else if (row.availableAt === prior.row.availableAt) {
      prior.conflicting ||= !equivalentGoals(row, prior.row);
      if (orderIds(row.observationHash, prior.row.observationHash) < 0 ||
        (row.observationHash === prior.row.observationHash && orderIds(row.evidenceRef, prior.row.evidenceRef) < 0)) prior.row = row;
    }
  }
  if (Array.from(versions.values()).some(({ conflicting }) => conflicting)) return withheld("ambiguous-result-observation");
  const sample = weightLocalGoalHistory(Array.from(versions.values(), ({ row }) => row), asOf, configuration);
  const { ordered, weighted, effectiveMatches, teamEffectiveMatches } = sample;
  if (effectiveMatches < configuration.minimumMatches) return withheld("insufficient-competition-history");
  const fitted = fitGoalRates(sample, configuration, true);
  if (!fitted.model) return withheld(fitted.reason);
  const { baseline, homeAdvantage } = fitted.model;
  const indexed = new Map(fitted.model.teams.map((team) => [team.teamId, team]));
  const components = trainingComponents([...indexed.keys()], weighted);
  const teams = fitted.model.teams.map((team) => ({ ...team, componentId: components.get(team.teamId)!,
    effectiveMatches: teamEffectiveMatches.get(team.teamId)! }));
  const lowScores = weighted.filter(({ row, weight }) => weight > 0 && row.homeGoals <= 1 && row.awayGoals <= 1).map(({ row, weight }) => {
    const rates = goalFitRates(baseline, homeAdvantage, indexed.get(row.homeTeamId), indexed.get(row.awayTeamId), row.neutralVenue);
    return { coefficient: correctionCoefficient(row.homeGoals, row.awayGoals, rates.home, rates.away), weight };
  });
  const body = { version: fittedGoalModelVersion(configuration), competitionId, asOf, configuration,
    baseline, homeAdvantage, teams, rho: estimateRho(lowScores, configuration.ridge),
    training: { historyHash: evidenceFingerprint(ordered), matches: ordered.length, effectiveMatches,
      firstKickoffAt: ordered[0]!.kickoffAt, lastKickoffAt: ordered[ordered.length - 1]!.kickoffAt,
      lowScoreMatches: lowScores.length, iterations: fitted.iterations,
      effectiveNeutralMatches: weighted.reduce((sum, { row, weight }) => sum + (row.neutralVenue ? weight : 0), 0) },
  };
  return { status: "fitted", artifact: registerArtifact({ ...body, hash: evidenceFingerprint(body) }) };
}

function correctedDistribution(home: number, away: number, rho: number): ScoreDistribution | null {
  function representedScores(rate: number): number[] {
    const probabilities = poisson(rate, maximumGoals);
    let mass = probabilities[0]!;
    for (let goals = 1; goals < probabilities.length; goals++) {
      mass += probabilities[goals]!;
      if (1 - mass < FITTED_GOALS_TAIL_BOUND / 2) return probabilities.slice(0, goals + 1);
    }
    return probabilities;
  }
  const homes = representedScores(home), aways = representedScores(away);
  // The four adjustments sum to zero over the represented grid.
  const states = homes.flatMap((probability, h) => aways.map((other, a) => {
    const correction = h <= 1 && a <= 1 ? 1 + correctionCoefficient(h, a, home, away) * rho : 1;
    return { home: h, away: a, halfHome: null, halfAway: null, probability: probability * other * correction };
  }));
  const tail = Math.max(0, 1 - states.reduce((sum, state) => sum + state.probability, 0));
  if (tail >= FITTED_GOALS_TAIL_BOUND) return null;
  return parseScoreDistribution({ version: SCORE_DISTRIBUTION_VERSION, states, unrepresentedProbability: tail });
}

/** Launch market marginals from the same score law, including the omitted grid tail. */
function correctedProbabilities(home: number, away: number, rho: number): IntelligenceProbabilities {
  const baseline = goalProbabilities(home, away);
  const delta = Math.exp(-home - away) * home * away * rho;
  const homeWin = baseline["match-result"]["home-win"] + delta;
  const awayWin = baseline["match-result"]["away-win"] + delta;
  const draw = baseline["match-result"].draw - 2 * delta;
  const yes = baseline["both-teams-to-score"].yes - delta;
  return freezeEvidence({
    "match-result": { "home-win": homeWin, draw, "away-win": awayWin },
    "double-chance": { "home-or-draw": homeWin + draw, "away-or-draw": awayWin + draw, "home-or-away": homeWin + awayWin },
    "total-goals": baseline["total-goals"],
    "both-teams-to-score": { yes, no: 1 - yes },
  });
}

/** Apply a frozen fit to a fixture without reading or refitting its training sample. */
export function scoreFittedCompetitionGoals(
  artifactInput: FittedGoalModel, fixtureInput: FittedGoalFixture,
  options: Readonly<{ allowSparsePrior?: boolean; lowScoreCorrection?: boolean }> = {},
): FittedGoalScoreResult {
  const withheld = (reason: ScoreWithholding): FittedGoalScoreResult => ({ status: "withheld", reason });
  const artifact = parseFittedGoalModel(artifactInput);
  if (!artifact) return withheld("invalid-fitted-model");
  const parsed = fixtureSchema.safeParse(fixtureInput);
  if (!parsed.success) return withheld("invalid-fixture");
  const fixture = parsed.data;
  if (fixture.competitionId !== artifact.competitionId) return withheld("wrong-competition");
  if (fixture.forecastAt >= fixture.kickoffAt - forecastLockMs) return withheld("forecast-locked");
  if (artifact.asOf > fixture.forecastAt) return withheld("artifact-from-future");
  const { configuration } = artifact, age = fixture.forecastAt - artifact.asOf;
  if (age > configuration.lookbackMs) return withheld("expired-fitted-model");
  const teamIndex = teamIndexes.get(artifact)!;
  const home = teamIndex.get(fixture.homeTeamId), away = teamIndex.get(fixture.awayTeamId);
  const decay = Math.exp(-Math.LN2 * age / configuration.halfLifeMs);
  const homeEffectiveMatches = (home?.effectiveMatches ?? 0) * decay;
  const awayEffectiveMatches = (away?.effectiveMatches ?? 0) * decay;
  const competitionEffectiveMatches = artifact.training.effectiveMatches * decay;
  const connectedTeamHistory = Boolean(home && away && home.componentId === away.componentId);
  const teamSupported = Math.min(homeEffectiveMatches, awayEffectiveMatches) >= configuration.minimumTeamMatches;
  const usesSparsePrior = !teamSupported || !connectedTeamHistory || competitionEffectiveMatches < configuration.minimumMatches;
  if (usesSparsePrior && options.allowSparsePrior !== true) {
    if (competitionEffectiveMatches < configuration.minimumMatches) return withheld("expired-fitted-model");
    return withheld(teamSupported ? "disconnected-team-history" : "insufficient-team-history");
  }
  const expectedGoals = goalFitRates(artifact.baseline, artifact.homeAdvantage, home, away, fixture.neutralVenue);
  if (![expectedGoals.home, expectedGoals.away].every(supportedGoalRate)) return withheld("unsupported-goal-rate");
  const dependence = options.lowScoreCorrection === false ? "independent" : "dixon-coles";
  const rho = dependence === "dixon-coles" ? artifact.rho : 0;
  const distribution = correctedDistribution(expectedGoals.home, expectedGoals.away, rho);
  if (!distribution) return withheld("unrepresented-score-mass");
  const highUncertainty = usesSparsePrior || competitionEffectiveMatches < 100 ||
    Math.min(homeEffectiveMatches, awayEffectiveMatches) < 20 || (fixture.neutralVenue && artifact.training.effectiveNeutralMatches === 0);
  return freezeEvidence({
    status: "scored", artifactHash: artifact.hash, modelVersion: artifact.version, dependence, rho, expectedGoals, distribution,
    probabilities: correctedProbabilities(expectedGoals.home, expectedGoals.away, rho),
    evidence: { competitionEffectiveMatches, homeEffectiveMatches, awayEffectiveMatches, connectedTeamHistory, usesSparsePrior,
      support: usesSparsePrior ? "competition-prior" : "connected-team-history",
      uncertainty: highUncertainty ? "high" : "moderate", eligibleForPublication: false, reason: "uncalibrated-fitted-model",
      venue: fixture.neutralVenue === true ? "verified-neutral" : fixture.neutralVenue === false ? "verified-home" : "home-designation" },
  });
}
