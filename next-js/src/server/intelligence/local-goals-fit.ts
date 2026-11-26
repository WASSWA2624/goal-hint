import "server-only";

import type { LocalGoalConfiguration, LocalGoalInput } from "./intelligence-contract.ts";
export { poisson } from "../../domain/poisson.ts";

export const localGoalDefaults: LocalGoalConfiguration = Object.freeze({
  lookbackMs: 730 * 86_400_000, halfLifeMs: 180 * 86_400_000, minimumMatches: 30,
  minimumTeamMatches: 6, ridge: 3, maximumIterations: 500, tolerance: 1e-7,
});
export function parseLocalGoalConfiguration(input: LocalGoalInput["configuration"]): LocalGoalConfiguration {
  const value = { ...localGoalDefaults, ...input };
  if (Object.keys(value).some((key) => !Object.hasOwn(localGoalDefaults, key)) ||
    Object.values(value).some((entry) => !Number.isFinite(entry) || entry <= 0) ||
    value.minimumMatches < 2 || value.minimumTeamMatches < 1 || value.maximumIterations > 5000 ||
    !Number.isInteger(value.minimumMatches) || !Number.isInteger(value.maximumIterations) ||
    value.tolerance > 0.01 || value.lookbackMs > 20 * 366 * 86_400_000) throw new Error("Invalid local model configuration.");
  return Object.freeze(value);
}
/** The model and the hourly evidence check use the same ordered, recency-weighted sample. */
export function weightLocalGoalHistory<Row extends Pick<GoalTrainingRow, "fixtureId" | "kickoffAt" | "homeTeamId" | "awayTeamId">>(
  rows: readonly Row[], cutoffAt: number, configuration = localGoalDefaults,
) {
  const ordered = [...rows].sort((a, b) => a.kickoffAt - b.kickoffAt || (a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0));
  const weighted = ordered.map((row) => ({ row, weight: Math.exp(-Math.LN2 * (cutoffAt - row.kickoffAt) / configuration.halfLifeMs) }));
  const teamEffectiveMatches = new Map<string, number>();
  let effectiveMatches = 0;
  for (const { row, weight } of weighted) {
    effectiveMatches += weight;
    for (const team of [row.homeTeamId, row.awayTeamId])
      teamEffectiveMatches.set(team, (teamEffectiveMatches.get(team) ?? 0) + weight);
  }
  return { ordered, weighted, effectiveMatches, teamEffectiveMatches };
}

export function hasLocalGoalSamples(effectiveMatches: number, homeMatches: number, awayMatches: number, configuration = localGoalDefaults): boolean {
  return effectiveMatches >= configuration.minimumMatches && Math.min(homeMatches, awayMatches) >= configuration.minimumTeamMatches;
}

export type GoalTrainingRow = Omit<LocalGoalInput["history"][number], "kickoffAt" | "availableAt"> &
  Readonly<{ kickoffAt: number; availableAt: number; neutralVenue?: boolean }>;
export type GoalStrength = Readonly<{ teamId: string; attack: number; defense: number }>;

export const goalFitRates = (
  baseline: number, homeAdvantage: number, home: GoalStrength | undefined, away: GoalStrength | undefined, neutralVenue?: boolean,
) => ({
  home: Math.exp(baseline + (neutralVenue ? 0 : homeAdvantage) + (home?.attack ?? 0) + (away?.defense ?? 0)),
  away: Math.exp(baseline + (away?.attack ?? 0) + (home?.defense ?? 0)),
});

export const supportedGoalRate = (value: number): boolean => Number.isFinite(value) && value >= 0.05 && value <= 6;

export function fitGoalRates(
  sample: ReturnType<typeof weightLocalGoalHistory<GoalTrainingRow>>, configuration: LocalGoalConfiguration, useNeutralVenue = false,
) {
  const { ordered: rows, weighted, effectiveMatches } = sample;
  const teamIds = [...new Set(rows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))].sort();
  const index = new Map(teamIds.map((team, i) => [team, i]));
  const n = teamIds.length, size = 2 + n * 2;
  const mean = (side: "homeGoals" | "awayGoals") => (weighted.reduce((sum, { row, weight }) => sum + row[side] * weight, 0) + 1) / (effectiveMatches + 1);
  const designatedHome = useNeutralVenue ? weighted.filter(({ row }) => !row.neutralVenue) : weighted;
  const goals = (side: "homeGoals" | "awayGoals") =>
    designatedHome.reduce((sum, { row, weight }) => sum + row[side] * weight, 1);
  const prior = [Math.log(mean("awayGoals")), useNeutralVenue
    ? Math.log(goals("homeGoals") / goals("awayGoals")) : Math.log(mean("homeGoals") / mean("awayGoals"))];
  let parameters = Array<number>(size).fill(0); parameters[0] = prior[0]!; parameters[1] = prior[1]!;
  const samples = weighted.flatMap(({ row, weight }) => [
    { features: [0, ...(useNeutralVenue && row.neutralVenue ? [] : [1]), 2 + index.get(row.homeTeamId)!, 2 + n + index.get(row.awayTeamId)!], goals: row.homeGoals, weight },
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
  let iterations = 0, converged = false;
  for (let iteration = 0; iteration < configuration.maximumIterations; iteration++) {
    const gradient = Array<number>(size).fill(0); objective(parameters, gradient);
    const norm = gradient.reduce((sum, entry) => sum + entry * entry, 0);
    iterations = iteration + 1;
    if (Math.sqrt(norm) / effectiveMatches <= configuration.tolerance) { converged = true; break; }
    let step = 1 / effectiveMatches, next = parameters, nextLoss = Infinity;
    for (let backtrack = 0; backtrack < 30; backtrack++) {
      next = parameters.map((entry, i) => entry - step * gradient[i]!); nextLoss = objective(next);
      if (Number.isFinite(nextLoss) && nextLoss <= loss - 0.0001 * step * norm) break;
      step /= 2;
    }
    if (!Number.isFinite(nextLoss) || nextLoss > loss) return { iterations, reason: "optimization-failed" as const };
    parameters = next;
    if (Math.abs(loss - nextLoss) / (1 + Math.abs(loss)) <= configuration.tolerance) { converged = true; break; }
    loss = nextLoss;
  }
  if (!converged) return { iterations, reason: "optimization-not-converged" as const };
  return { iterations, model: {
    baseline: parameters[0]!, homeAdvantage: parameters[1]!,
    teams: teamIds.map((teamId, i) => ({ teamId, attack: parameters[2 + i]!, defense: parameters[2 + n + i]! })),
  } };
}
