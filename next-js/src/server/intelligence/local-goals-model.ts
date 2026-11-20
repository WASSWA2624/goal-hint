import "server-only";

import { marketRules } from "../../domain/markets.ts";
import { parseScoreDistribution, SCORE_DISTRIBUTION_VERSION } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { IntelligenceProbabilities, LocalGoalConfiguration, LocalGoalForecast, LocalGoalInput } from "./intelligence-contract.ts";

import { fitGoalRates, goalFitRates, hasLocalGoalSamples, parseLocalGoalConfiguration, poisson,
  supportedGoalRate, weightLocalGoalHistory } from "./local-goals-fit.ts";

export { hasLocalGoalSamples, localGoalDefaults, weightLocalGoalHistory } from "./local-goals-fit.ts";

export const LOCAL_GOALS_VERSION = "regularized-poisson-v1";
const lockMs = 5 * 60_000;
const issuedForecasts = new WeakSet<object>();
export const isIssuedLocalGoalForecast = (forecast: LocalGoalForecast): boolean => issuedForecasts.has(forecast);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const instant = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export function localGoalModelVersion(configuration?: Partial<LocalGoalConfiguration>): string {
  return `${LOCAL_GOALS_VERSION}:${evidenceFingerprint(parseLocalGoalConfiguration(configuration)).slice(0, 16)}`;
}
/** All four markets come from one independent Poisson score model. The compact
 * score grid reports its omitted tail; market marginals use effectively complete
 * support (60 goals, rates bounded to six) and exact binary formulas. */
export function goalProbabilities(home: number, away: number): IntelligenceProbabilities {
  if (![home, away].every(supportedGoalRate)) throw new Error("Unsupported goal rate.");
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
  const fixture = input.fixture, configuration = parseLocalGoalConfiguration(input.configuration);
  if (!fixture || ![fixture.fixtureId, fixture.competitionId, fixture.homeTeamId, fixture.awayTeamId].every(validId) ||
    fixture.homeTeamId === fixture.awayTeamId || !instant(fixture.forecastAt) || !instant(fixture.kickoffAt) ||
    fixture.cohort !== undefined && !["men", "women", "unspecified"].includes(fixture.cohort) ||
    !Array.isArray(input.history) || input.history.length > 100_000) throw new Error("Invalid local model input.");
  const cutoffAt = Math.min(fixture.forecastAt, fixture.kickoffAt - lockMs), seen = new Set<string>();
  for (const row of input.history) {
    if (![row.fixtureId, row.competitionId, row.homeTeamId, row.awayTeamId, row.evidenceRef].every(validId) ||
      row.homeTeamId === row.awayTeamId || !instant(row.kickoffAt) || !instant(row.availableAt) || row.availableAt < row.kickoffAt ||
      ![row.homeGoals, row.awayGoals].every((value) => Number.isInteger(value) && value >= 0 && value <= 100) ||
      row.period !== marketRules.period || !/^[a-f0-9]{64}$/u.test(row.observationHash) || seen.has(row.fixtureId)) throw new Error("Invalid or duplicate result evidence.");
    seen.add(row.fixtureId);
  }
  const eligible = input.history.filter((row) => row.competitionId === fixture.competitionId && row.fixtureId !== fixture.fixtureId &&
    row.kickoffAt < cutoffAt && row.kickoffAt >= cutoffAt - configuration.lookbackMs && row.availableAt <= cutoffAt);
  const sample = weightLocalGoalHistory(eligible, cutoffAt, configuration);
  const { ordered: rows, effectiveMatches, teamEffectiveMatches } = sample;
  const diagnostics = { matches: rows.length, effectiveMatches, homeEffectiveMatches: teamEffectiveMatches.get(fixture.homeTeamId) ?? 0,
    awayEffectiveMatches: teamEffectiveMatches.get(fixture.awayTeamId) ?? 0, iterations: 0, converged: false,
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
  if (!hasLocalGoalSamples(effectiveMatches, diagnostics.homeEffectiveMatches, diagnostics.awayEffectiveMatches, configuration))
    return finish(["insufficient-point-in-time-history"]);
  const fitted = fitGoalRates(sample, configuration);
  diagnostics.iterations = fitted.iterations;
  if (!fitted.model) return finish([fitted.reason]);
  diagnostics.converged = true;
  const { baseline, homeAdvantage, teams } = fitted.model;
  const { home, away } = goalFitRates(baseline, homeAdvantage,
    teams.find((team) => team.teamId === fixture.homeTeamId), teams.find((team) => team.teamId === fixture.awayTeamId));
  if (![home, away].every(supportedGoalRate)) return finish(["unsupported-goal-rate"]);
  if (Math.min(diagnostics.homeEffectiveMatches, diagnostics.awayEffectiveMatches) >= 20 && effectiveMatches >= 100) diagnostics.uncertainty = "moderate";
  return finish(["uncalibrated-shadow-estimate", "player-and-context-effects-not-estimated"], { home, away });
}
