import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { marketRules, validateMarketSnapshot, type MarketSnapshot } from "../../domain/markets.ts";
import { freezeEvidence, parseEvidenceContext } from "../evidence/evidence-input.ts";
import { parseCatalogEvidenceRef } from "../football/catalog-input.ts";
import type { BaselineConfiguration, BaselineForecast, BaselineResult, EvaluationFixture } from "./evaluation-contract.ts";
import { parseBaselineConfiguration } from "./evaluation-input.ts";

const identity = z.uuid().transform((value) => value.toLowerCase());
const instant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); return true; } catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const historySchema = z.array(z.object({ fixtureId: identity, cycleId: identity, competitionId: identity,
  homeTeamId: identity, awayTeamId: identity, kickoffAt: instant, availableAt: instant,
  homeGoals: z.number().int().nonnegative().max(1000), awayGoals: z.number().int().nonnegative().max(1000),
  period: z.literal(marketRules.period), observationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  evidenceRef: z.string().min(1).max(512).transform(parseCatalogEvidenceRef),
}).strict().refine((result) => result.homeTeamId !== result.awayTeamId && result.availableAt >= result.kickoffAt)).max(100_000);

export class BaselineReconstructionError extends Error {
  constructor() { super("Baseline history or configuration is invalid. Private source values are withheld."); this.name = "BaselineReconstructionError"; }
}
const order = (first: string, second: string): number => first < second ? -1 : first > second ? 1 : 0;
function unsupportedBinary(markets: MarketSnapshot): MarketSnapshot {
  const families = ["total-goals", "both-teams-to-score"] as const;
  return freezeEvidence({ ...markets, markets: { ...markets.markets,
    "total-goals": { available: false, reason: "unsupported-family" },
    "both-teams-to-score": { available: false, reason: "unsupported-family" } },
    issues: [...markets.issues.filter((issue) => !families.some((family) => family === issue.family)),
      ...families.map((family) => ({ family, reason: "unsupported-family" as const }))] });
}
function forecast(config: BaselineConfiguration, history: readonly BaselineResult[], markets: MarketSnapshot,
  limitations: readonly string[]): BaselineForecast {
  return freezeEvidence({ version: config.version, historyIds: history.map((result) => result.observationHash), markets, limitations: [...limitations] });
}
function leagueFrequency(config: BaselineConfiguration, history: readonly BaselineResult[]): BaselineForecast {
  if (history.length < config.minimumMatches) return forecast(config, history, validateMarketSnapshot({}), ["insufficient-history"]);
  const counts = { home: 0, draw: 0, away: 0, over: 0, under: 0, yes: 0, no: 0 };
  for (const result of history) {
    counts[result.homeGoals > result.awayGoals ? "home" : result.homeGoals === result.awayGoals ? "draw" : "away"]++;
    counts[result.homeGoals + result.awayGoals > 2.5 ? "over" : "under"]++;
    counts[result.homeGoals > 0 && result.awayGoals > 0 ? "yes" : "no"]++;
  }
  const alpha = config.leagueFrequency.alpha, categorical = history.length + 3 * alpha, binary = history.length + 2 * alpha;
  // The shared domain accepts only provider/AI source labels. This internal marker
  // never classifies a baseline as AI; evaluation's outer system identity owns attribution.
  const markets = validateMarketSnapshot({
    "match-result": { source: "ai", period: marketRules.period, probabilities: {
      "home-win": (counts.home + alpha) / categorical, draw: (counts.draw + alpha) / categorical, "away-win": (counts.away + alpha) / categorical } },
    "total-goals": { source: "ai", period: marketRules.period, line: 2.5,
      probabilities: { "over-2.5": (counts.over + alpha) / binary, "under-2.5": (counts.under + alpha) / binary } },
    "both-teams-to-score": { source: "ai", period: marketRules.period,
      probabilities: { yes: (counts.yes + alpha) / binary, no: (counts.no + alpha) / binary } },
  });
  return forecast(config, history, markets, ["empirical-league-frequencies-with-configured-additive-smoothing"]);
}
function davidson(home: number, away: number, config: BaselineConfiguration["teamStrength"]): Readonly<{
  "home-win": number; draw: number; "away-win": number;
}> {
  const logQ = Math.LN10 * (home - away + config.homeAdvantage) / (2 * config.scale);
  if (logQ === Infinity) return { "home-win": 1, draw: 0, "away-win": 0 };
  if (logQ === -Infinity) return { "home-win": 0, draw: 0, "away-win": 1 };
  const logDraw = Math.log(config.drawWeight), maximum = Math.max(logQ, logDraw, -logQ);
  // Stable evaluation of [q, drawWeight, 1/q] avoids overflowing q for extreme
  // approved parameters. Strict probability boundaries still belong to 005.
  const homeWeight = Math.exp(logQ - maximum), drawWeight = Math.exp(logDraw - maximum), awayWeight = Math.exp(-logQ - maximum);
  const denominator = homeWeight + drawWeight + awayWeight;
  return { "home-win": homeWeight / denominator, draw: drawWeight / denominator, "away-win": awayWeight / denominator };
}
function teamStrength(config: BaselineConfiguration, history: readonly BaselineResult[], homeTeamId: string, awayTeamId: string): BaselineForecast {
  const limitations = ["regulation-match-result-only", "total-goals-unsupported", "both-teams-to-score-unsupported"];
  if (history.length < config.minimumMatches) return forecast(config, history, unsupportedBinary(validateMarketSnapshot({})),
    ["insufficient-history", ...limitations]);
  const parameters = config.teamStrength, ratings = new Map<string, number>();
  for (const result of history) {
    const home = ratings.get(result.homeTeamId) ?? parameters.initialRating, away = ratings.get(result.awayTeamId) ?? parameters.initialRating;
    const probability = davidson(home, away, parameters);
    const actual = result.homeGoals > result.awayGoals ? 1 : result.homeGoals === result.awayGoals ? 0.5 : 0;
    const adjustment = parameters.kFactor * (actual - (probability["home-win"] + 0.5 * probability.draw));
    const nextHome = home + adjustment, nextAway = away - adjustment;
    if (![nextHome, nextAway].every(Number.isFinite)) throw new BaselineReconstructionError();
    ratings.set(result.homeTeamId, nextHome); ratings.set(result.awayTeamId, nextAway);
  }
  if (!ratings.has(homeTeamId)) limitations.push("home-team-rating-unobserved");
  if (!ratings.has(awayTeamId)) limitations.push("away-team-rating-unobserved");
  const probabilities = davidson(ratings.get(homeTeamId) ?? parameters.initialRating, ratings.get(awayTeamId) ?? parameters.initialRating, parameters);
  return forecast(config, history, unsupportedBinary(validateMarketSnapshot({ "match-result": {
    source: "ai", period: marketRules.period, probabilities,
  } })), limitations);
}

/** Reconstructs only results that were actually available at this evidence cutoff.
 * Target outcomes and stored AI/provider forecasts are never read here. */
export function reconstructBaselines(fixture: EvaluationFixture, history: readonly BaselineResult[], configuration: BaselineConfiguration):
  Readonly<Record<"league-frequency" | "team-strength", BaselineForecast>> {
  try {
    const config = parseBaselineConfiguration(configuration), context = parseEvidenceContext(fixture.context),
      competitionId = identity.parse(fixture.competitionId), rows = historySchema.parse(history);
    const identities = new Set<string>();
    for (const result of rows) {
      const key = `${result.fixtureId}:${result.cycleId}`;
      if (identities.has(key)) throw new BaselineReconstructionError();
      identities.add(key);
    }
    const startsAt = context.cutoffAt - config.lookbackMs;
    const eligible = rows.filter((result) => result.competitionId === competitionId && result.fixtureId !== context.fixtureId &&
      result.cycleId !== context.cycleId && result.kickoffAt < context.cutoffAt && result.kickoffAt >= startsAt && result.availableAt <= context.cutoffAt)
      .sort((first, second) => first.kickoffAt - second.kickoffAt || first.availableAt - second.availableAt ||
        order(first.fixtureId, second.fixtureId) || order(first.cycleId, second.cycleId) || order(first.observationHash, second.observationHash));
    return freezeEvidence({ "league-frequency": leagueFrequency(config, eligible),
      "team-strength": teamStrength(config, eligible, context.home.teamId, context.away.teamId) });
  } catch { throw new BaselineReconstructionError(); }
}
