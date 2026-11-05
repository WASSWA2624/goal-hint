import "server-only";

import { marketRules } from "../../domain/markets.ts";
import { parseScoreDistribution, SCORE_DISTRIBUTION_VERSION } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { IntelligenceProbabilities, LocalGoalConfiguration, LocalGoalForecast, LocalGoalInput } from "./intelligence-contract.ts";

export const LOCAL_GOALS_VERSION = "regularized-poisson-v1";
export const localGoalDefaults: LocalGoalConfiguration = Object.freeze({
  lookbackMs: 730 * 86_400_000, halfLifeMs: 180 * 86_400_000, minimumMatches: 30,
  minimumTeamMatches: 6, ridge: 3, maximumIterations: 500, tolerance: 1e-7,
});
const lockMs = 5 * 60_000;
const issuedForecasts = new WeakSet<object>();
export const isIssuedLocalGoalForecast = (forecast: LocalGoalForecast): boolean => issuedForecasts.has(forecast);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const instant = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function config(input: LocalGoalInput["configuration"]): LocalGoalConfiguration {
  const value = { ...localGoalDefaults, ...input };
  if (Object.keys(value).some((key) => !Object.hasOwn(localGoalDefaults, key)) ||
    Object.values(value).some((entry) => !Number.isFinite(entry) || entry <= 0) ||
    value.minimumMatches < 2 || value.minimumTeamMatches < 1 || value.maximumIterations > 5000 ||
    !Number.isInteger(value.minimumMatches) || !Number.isInteger(value.maximumIterations) ||
    value.tolerance > 0.01 || value.lookbackMs > 20 * 366 * 86_400_000) throw new Error("Invalid local model configuration.");
  return Object.freeze(value);
}
export function localGoalModelVersion(configuration?: Partial<LocalGoalConfiguration>): string {
  return `${LOCAL_GOALS_VERSION}:${evidenceFingerprint(config(configuration)).slice(0, 16)}`;
}
function poisson(rate: number, maximum: number): number[] {
  const probabilities = [Math.exp(-rate)];
  for (let goals = 1; goals <= maximum; goals++) probabilities.push(probabilities[goals - 1]! * rate / goals);
  return probabilities;
}
/** All four markets come from one independent Poisson score model. The compact
 * score grid reports its omitted tail; market marginals use effectively complete
 * support (60 goals, rates bounded to six) and exact binary formulas. */
export function goalProbabilities(home: number, away: number): IntelligenceProbabilities {
  if (![home, away].every((value) => Number.isFinite(value) && value >= 0.05 && value <= 6)) throw new Error("Unsupported goal rate.");
  const homes = poisson(home, 60), aways = poisson(away, 60);
  let homeWin = 0, draw = 0;
  for (let h = 0; h < homes.length; h++) for (let a = 0; a < aways.length; a++) {
    const probability = homes[h]! * aways[a]!;
    if (h > a) homeWin += probability;
    if (h === a) draw += probability;
  }
  const awayWin = 1 - homeWin - draw, total = home + away;
  const under = Math.exp(-total) * (1 + total + total * total / 2);
  const yes = (1 - Math.exp(-home)) * (1 - Math.exp(-away));
  return freezeEvidence({ "match-result": { "home-win": homeWin, draw, "away-win": awayWin },
    "double-chance": { "home-or-draw": homeWin + draw, "away-or-draw": awayWin + draw, "home-or-away": homeWin + awayWin },
    "total-goals": { "over-2.5": 1 - under, "under-2.5": under }, "both-teams-to-score": { yes, no: 1 - yes } });
}

/** Fits regularized, recency-weighted Poisson log rates using only independently
 * observed regulation results. No provider forecast or AI number enters fitting.
 * Configuration is methodological, not empirically qualified. */
export function estimateLocalGoals(input: LocalGoalInput): LocalGoalForecast {
  const fixture = input.fixture, configuration = config(input.configuration);
  if (!fixture || ![fixture.fixtureId, fixture.competitionId, fixture.homeTeamId, fixture.awayTeamId].every(validId) ||
    fixture.homeTeamId === fixture.awayTeamId || !instant(fixture.forecastAt) || !instant(fixture.kickoffAt) ||
    fixture.cohort !== undefined && !["men", "women", "unspecified"].includes(fixture.cohort) ||
    !Array.isArray(input.history) || input.history.length > 100_000) throw new Error("Invalid local model input.");
  const cutoffAt = Math.min(fixture.forecastAt, fixture.kickoffAt - lockMs), seen = new Set<string>();
  for (const row of input.history) {
    if (![row.fixtureId, row.cycleId, row.competitionId, row.homeTeamId, row.awayTeamId, row.evidenceRef].every(validId) ||
      row.homeTeamId === row.awayTeamId || !instant(row.kickoffAt) || !instant(row.availableAt) || row.availableAt < row.kickoffAt ||
      ![row.homeGoals, row.awayGoals].every((value) => Number.isInteger(value) && value >= 0 && value <= 100) ||
      row.period !== marketRules.period || !/^[a-f0-9]{64}$/u.test(row.observationHash) || seen.has(row.fixtureId)) throw new Error("Invalid or duplicate result evidence.");
    seen.add(row.fixtureId);
  }
  const rows = input.history.filter((row) => row.competitionId === fixture.competitionId && row.fixtureId !== fixture.fixtureId &&
    row.kickoffAt < cutoffAt && row.kickoffAt >= cutoffAt - configuration.lookbackMs && row.availableAt <= cutoffAt)
    .sort((a, b) => a.kickoffAt - b.kickoffAt || (a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0));
  const weighted = rows.map((row) => ({ row, weight: Math.exp(-Math.LN2 * (cutoffAt - row.kickoffAt) / configuration.halfLifeMs) }));
  const effectiveMatches = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const teamMatches = (team: string) => weighted.reduce((sum, { row, weight }) => sum + (row.homeTeamId === team || row.awayTeamId === team ? weight : 0), 0);
  const diagnostics = { matches: rows.length, effectiveMatches, homeEffectiveMatches: teamMatches(fixture.homeTeamId),
    awayEffectiveMatches: teamMatches(fixture.awayTeamId), iterations: 0, converged: false,
    uncertainty: "high" as "high" | "moderate", tailProbability: 0 };
  const finish = (reasons: string[], expectedGoals: LocalGoalForecast["expectedGoals"] = null): LocalGoalForecast => {
    let scoreDistribution: LocalGoalForecast["scoreDistribution"] = null;
    if (expectedGoals) {
      const h = poisson(expectedGoals.home, 20), a = poisson(expectedGoals.away, 20);
      const states = h.flatMap((probability, home) => a.map((other, away) => ({ home, away, halfHome: null, halfAway: null, probability: probability * other })));
      diagnostics.tailProbability = Math.max(0, 1 - states.reduce((sum, state) => sum + state.probability, 0));
      scoreDistribution = parseScoreDistribution({ version: SCORE_DISTRIBUTION_VERSION, states, unrepresentedProbability: diagnostics.tailProbability });
    }
    const body = { source: "local" as const, modelVersion: localGoalModelVersion(configuration), fixtureId: fixture.fixtureId,
      fixture: { ...fixture }, historyHash: evidenceFingerprint(rows),
      forecastAt: fixture.forecastAt, cutoffAt, status: expectedGoals ? "estimated" as const : "withheld" as const,
      probabilities: expectedGoals ? goalProbabilities(expectedGoals.home, expectedGoals.away) : null, scoreDistribution,
      expectedGoals, historyIds: rows.map((row) => row.observationHash), configuration, diagnostics, reasons };
    const forecast = freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
    issuedForecasts.add(forecast); return forecast;
  };
  if (fixture.forecastAt >= fixture.kickoffAt - lockMs) return finish(["forecast-locked"]);
  if (effectiveMatches < configuration.minimumMatches || Math.min(diagnostics.homeEffectiveMatches, diagnostics.awayEffectiveMatches) < configuration.minimumTeamMatches)
    return finish(["insufficient-point-in-time-history"]);
  const teamIds = [...new Set(rows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))].sort();
  const index = new Map(teamIds.map((team, i) => [team, i]));
  const n = teamIds.length, size = 2 + n * 2;
  const mean = (side: "homeGoals" | "awayGoals") => (weighted.reduce((sum, { row, weight }) => sum + row[side] * weight, 0) + 1) / (effectiveMatches + 1);
  const prior = [Math.log(mean("awayGoals")), Math.log(mean("homeGoals") / mean("awayGoals"))];
  let parameters = Array<number>(size).fill(0); parameters[0] = prior[0]!; parameters[1] = prior[1]!;
  const samples = weighted.flatMap(({ row, weight }) => [
    { features: [0, 1, 2 + index.get(row.homeTeamId)!, 2 + n + index.get(row.awayTeamId)!], goals: row.homeGoals, weight },
    { features: [0, 2 + index.get(row.awayTeamId)!, 2 + n + index.get(row.homeTeamId)!], goals: row.awayGoals, weight },
  ]);
  function objective(values: number[], gradient?: number[]) {
    let loss = 0;
    for (const sample of samples) {
      const eta = sample.features.reduce((sum, feature) => sum + values[feature]!, 0), rate = Math.exp(eta);
      loss += sample.weight * (rate - sample.goals * eta);
      if (gradient) for (const feature of sample.features) gradient[feature]! += sample.weight * (rate - sample.goals);
    }
    for (let i = 0; i < values.length; i++) {
      const delta = values[i]! - (i < 2 ? prior[i]! : 0), penalty = i < 2 ? 0.1 : configuration.ridge;
      loss += penalty * delta * delta / 2;
      if (gradient) gradient[i]! += penalty * delta;
    }
    return loss;
  }
  let loss = objective(parameters);
  for (let iteration = 0; iteration < configuration.maximumIterations; iteration++) {
    const gradient = Array<number>(size).fill(0); objective(parameters, gradient);
    const norm = gradient.reduce((sum, entry) => sum + entry * entry, 0);
    diagnostics.iterations = iteration + 1;
    if (Math.sqrt(norm) / effectiveMatches <= configuration.tolerance) { diagnostics.converged = true; break; }
    let step = 1 / effectiveMatches, next = parameters, nextLoss = Infinity;
    for (let backtrack = 0; backtrack < 30; backtrack++) {
      next = parameters.map((entry, i) => entry - step * gradient[i]!); nextLoss = objective(next);
      if (Number.isFinite(nextLoss) && nextLoss <= loss - 0.0001 * step * norm) break;
      step /= 2;
    }
    if (!Number.isFinite(nextLoss) || nextLoss > loss) return finish(["optimization-failed"]);
    parameters = next;
    if (Math.abs(loss - nextLoss) / (1 + Math.abs(loss)) <= configuration.tolerance) { diagnostics.converged = true; break; }
    loss = nextLoss;
  }
  if (!diagnostics.converged) return finish(["optimization-not-converged"]);
  const home = Math.exp(parameters[0]! + parameters[1]! + parameters[2 + index.get(fixture.homeTeamId)!]! + parameters[2 + n + index.get(fixture.awayTeamId)!]!);
  const away = Math.exp(parameters[0]! + parameters[2 + index.get(fixture.awayTeamId)!]! + parameters[2 + n + index.get(fixture.homeTeamId)!]!);
  if (![home, away].every((value) => Number.isFinite(value) && value >= 0.05 && value <= 6)) return finish(["unsupported-goal-rate"]);
  if (Math.min(diagnostics.homeEffectiveMatches, diagnostics.awayEffectiveMatches) >= 20 && effectiveMatches >= 100) diagnostics.uncertainty = "moderate";
  return finish(["uncalibrated-shadow-estimate", "player-and-context-effects-not-estimated"], { home, away });
}
