import "server-only";

import { isEligibleLocalFirstGoalDefinition, localFirstGoalMarketDefinitions, registeredForecastGoalMarkets,
  type RegisteredGoalMarketDefinition } from "../../domain/goal-market-definitions.ts";
import { LOCAL_FIRST_MARKET_REGISTRY_VERSION, MARKET_REGISTRY_VERSION, marketRegistry, type RegisteredMarketFamily } from "../../domain/market-registry.ts";
import { marketRules, type MarketFamily, type MarketSource, type SelectionFor } from "../../domain/markets.ts";
import { deriveBoundedGoalMarket, GOAL_DERIVATION_TAIL_BOUND, type GoalDerivationResult, type GoalGrade,
  type GoalMarketDefinition, type GoalMarketPeriod } from "../../domain/score-distribution-markets.ts";
import { parseScoreDistribution, scoreDistributionRules, type ScoreDistribution } from "../../domain/score-distribution.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ResolvedForecastCandidate, ResolvedForecastMarket } from "../fallback/fallback-contract.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import type { PublishedGoalMarket } from "./goal-market-store.ts";

export const FORECAST_MARKET_EVALUATION_VERSION = "forecast-market-evaluation-v1";
export const LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION = "forecast-market-evaluation-v2";

export type QualifiedForecastGoalModel = Readonly<{
  source: Extract<MarketSource, "ai" | "local-engine">;
  modelVersion: string;
  scoreDistribution: ScoreDistribution;
  /** Exact instances backed by verified evaluation authority. A source's ability
   * to emit a valid grid does not qualify every market that the grid can score. */
  qualifiedMarkets: readonly string[];
}>;

const legacy = {
  "match-result": { key: "goal:full-time:result", choices: { home: "home-win", draw: "draw", away: "away-win" } },
  "double-chance": { key: "goal:full-time:double-chance", choices: { "home-draw": "home-or-draw", "draw-away": "away-or-draw", "home-away": "home-or-away" } },
  "total-goals": { key: `goal:full-time:totals:total:${marketRules.totalGoalsLine}:binary`, choices: { over: "over-2.5", under: "under-2.5" } },
  "both-teams-to-score": { key: "goal:full-time:btts", choices: { yes: "yes", no: "no" } },
} satisfies { [Family in MarketFamily]: { key: string; choices: Readonly<Record<string, SelectionFor<Family>>> } };
const legacyByKey = new Map(Object.entries(legacy).map(([family, mapping]) => [mapping.key, family as MarketFamily]));
export function legacyForecastMarketKey(family: MarketFamily): string { return legacy[family].key; }
export function canonicalLegacyForecastSelection(family: MarketFamily, selection: string): string | null {
  return Object.entries(legacy[family].choices).find(([, key]) => key === selection)?.[0] ?? null;
}
const goalMarkets = registeredForecastGoalMarkets();
const localFirstGoalMarkets = registeredForecastGoalMarkets(true);
const publishedLocalKeys = new Set(localFirstGoalMarketDefinitions.map(({ key }) => key));
const registeredByKey = new Map(goalMarkets.map((row) => [row.definition.key, row]));
const represented = new Set(goalMarkets.map((row) => row.family));
const otherFamilies = (Object.keys(marketRegistry) as RegisteredMarketFamily[]).filter((family) => !represented.has(family));

type CandidateMarkets = ResolvedForecastCandidate["markets"];
type UnavailableReason = Extract<ResolvedForecastMarket, { available: false }>["reason"] |
  Extract<GoalDerivationResult, { available: false }>["reason"] | "no-qualified-goal-model" | "unverified-goal-model" |
  "no-qualified-market-model" | "no-qualified-period-model" | "unsupported-settlement" | "model-cross-market-conflict" |
  "unresolved-selection-order" | "outside-full-match-totals-range" | "unsupported-publication-projection";
type RowIdentity = Readonly<{ marketKey: string; family: RegisteredMarketFamily; period: GoalMarketPeriod | null }>;
type ForecastSelection = Readonly<{
  key: string; outcomes: Readonly<Record<GoalGrade, number>>;
  /** Outright wins. Partial wins are recorded as their own outcome. */
  winProbability: number; winProbabilityUpperBound: number;
}>;
export type ForecastMarketEvaluation = RowIdentity & (Readonly<{
  status: "unavailable"; reason: UnavailableReason; detail?: string;
}> | Readonly<{
  status: "estimated"; source: MarketSource; ruleVersion: string; definition?: GoalMarketDefinition; modelVersion?: string;
  group: GoalMarketDefinition["group"]; selections: readonly ForecastSelection[]; unrepresentedProbability: number;
  recommendation: Readonly<{ selection: string; winProbability: number; winProbabilityUpperBound: number }>;
}>);

function unavailable(identity: RowIdentity, reason: UnavailableReason, detail?: string): ForecastMarketEvaluation {
  return { ...identity, status: "unavailable", reason, ...(detail === undefined ? {} : { detail }) };
}

function selection(key: string, outcomes: ForecastSelection["outcomes"], tail: number): ForecastSelection {
  return { key, outcomes, winProbability: outcomes.win, winProbabilityUpperBound: Math.min(1, outcomes.win + tail) };
}
const recommendationFor = ({ key, winProbability, winProbabilityUpperBound }: ForecastSelection) =>
  ({ selection: key, winProbability, winProbabilityUpperBound });

function evaluateLegacy(identity: RowIdentity, definition: GoalMarketDefinition, family: MarketFamily, market: ResolvedForecastMarket): ForecastMarketEvaluation {
  if (!market.available) return unavailable(identity, market.reason);
  const probabilities: Readonly<Record<string, number>> = market.market.probabilities;
  const choices: Readonly<Record<string, string>> = legacy[family].choices;
  const selections = Object.entries(choices).map(([key, original]) => {
    const win = probabilities[original]!;
    return selection(key, { win, loss: 1 - win, push: 0, "half-win": 0, "half-loss": 0 }, 0);
  });
  const best = selections.find(({ key }) => choices[key] === market.market.selection)!;
  return { ...identity, status: "estimated", source: market.market.source, ruleVersion: market.market.ruleVersion,
    definition, group: definition.group, selections, unrepresentedProbability: 0, recommendation: recommendationFor(best) };
}

/** All previously resolved coupled groups must fit into the same grid's bounds.
 * This leaves each existing result intact when an optional expansion conflicts. */
function reconcilesLegacy(distribution: ScoreDistribution, candidateMarkets: CandidateMarkets, source?: MarketSource): boolean {
  return (Object.keys(legacy) as MarketFamily[]).every((family) => {
    const market = candidateMarkets[family];
    if (!market.available || source && market.market.source !== source) return true;
    const { key, choices } = legacy[family], registered = registeredByKey.get(key);
    const derived = registered && deriveBoundedGoalMarket(distribution, registered.definition);
    if (!derived?.available) return false;
    const lookup: Readonly<Record<string, string>> = choices;
    const probabilities: Readonly<Record<string, number>> = market.market.probabilities;
    const tolerance = scoreDistributionRules.massTolerance, expectedMass = family === "double-chance" ? 2 : 1;
    if (Math.abs(Object.values(probabilities).reduce((sum, item) => sum + item, 0) - expectedMass) > tolerance) return false;
    return derived.selections.every(({ key, outcomes }) => {
      const accepted = probabilities[lookup[key]!]!;
      return accepted >= outcomes.win - tolerance && accepted <= outcomes.win + derived.unrepresentedProbability + tolerance;
    });
  });
}

type GoalState = Readonly<{ distribution: ScoreDistribution; qualified: ReadonlySet<string>; model: QualifiedForecastGoalModel }> |
  Readonly<{ reason: UnavailableReason }>;

function qualifiedGoalState(input: ForecastMarketEvaluatorInput): GoalState {
  const { goalModel } = input;
  if (!goalModel) return { reason: "no-qualified-goal-model" };
  if ((goalModel.source !== "ai" && goalModel.source !== "local-engine") || !goalModel.modelVersion ||
    !Array.isArray(goalModel.qualifiedMarkets) || !provenTrue(() => input.verifyGoalModel?.(goalModel))) return { reason: "unverified-goal-model" };
  let distribution;
  try { distribution = parseScoreDistribution(goalModel.scoreDistribution); }
  catch { return { reason: "invalid-distribution" }; }
  if (distribution.unrepresentedProbability >= GOAL_DERIVATION_TAIL_BOUND) return { reason: "unrepresented-score-mass" };
  if (!reconcilesLegacy(distribution, input.candidateMarkets, input.localFirst ? goalModel.source : undefined))
    return { reason: "model-cross-market-conflict" };
  return { distribution, qualified: new Set(goalModel.qualifiedMarkets), model: goalModel };
}

function evaluateRegisteredGoal(row: RegisteredGoalMarketDefinition, identity: RowIdentity, state: GoalState): ForecastMarketEvaluation {
  const { definition, family } = row, { settlement, periods, models } = marketRegistry[family];
  if (settlement.basis !== "score" || !periods.includes(definition.period) ||
    !definition.selections.every(({ rule }) => settlement.rules.includes(rule.kind)))
    return unavailable(identity, "invalid-definition");
  const periodDependent = definition.period !== "full-time" || models.evidence === "verified-first-and-second-half-scores";
  if ("reason" in state) return unavailable(identity, periodDependent && state.reason === "no-qualified-goal-model" ? "no-qualified-period-model" : state.reason);
  if (!state.qualified.has(definition.key)) return unavailable(identity, periodDependent ? "no-qualified-period-model" : "no-qualified-market-model");
  const result = deriveBoundedGoalMarket(state.distribution, definition);
  if (!result.available) return unavailable(identity, result.reason);
  const { unrepresentedProbability } = result;
  const selections = result.selections.map(({ key, outcomes }) => selection(key, outcomes, unrepresentedProbability));
  const ranked = [...selections].sort((a, b) => b.winProbability - a.winProbability || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const [best, next] = ranked as [ForecastSelection, ForecastSelection, ...ForecastSelection[]];
  if (unrepresentedProbability && best.winProbability < next.winProbabilityUpperBound) return unavailable(identity, "unresolved-selection-order");
  return { ...identity, status: "estimated", source: state.model.source, modelVersion: state.model.modelVersion,
    ruleVersion: result.ruleVersion, definition, group: definition.group, selections, unrepresentedProbability, recommendation: recommendationFor(best) };
}

export type ForecastMarketEvaluatorInput = Readonly<{
  /** The caller owns refresh-stage validation of the four source-resolved groups. */
  candidateMarkets: CandidateMarkets;
  goalModel?: QualifiedForecastGoalModel;
  verifyGoalModel?(model: QualifiedForecastGoalModel): boolean;
  localFirst?: true;
  /** Immutable derived rows of the existing authorized regulation-count profile. */
  publishedLocalMarkets?: readonly PublishedGoalMarket[];
}>;

function evaluatePublishedLocalMarket(identity: RowIdentity, definition: GoalMarketDefinition,
  published: PublishedGoalMarket): ForecastMarketEvaluation {
  const { derivation } = published;
  if (!derivation.available) return unavailable(identity, derivation.reason);
  const { market } = derivation;
  if (market.source !== "local-poisson" || evidenceFingerprint(definition) !== evidenceFingerprint(market.definition)) {
    return unavailable(identity, "invalid-definition");
  }
  const selections = market.selections.map(({ key, outcomes }) => selection(key, outcomes, 0));
  const best = selections.find(({ key }) => key === market.selection)!;
  return { ...identity, status: "estimated", source: "local-engine", ruleVersion: market.ruleVersion,
    definition, group: definition.group, selections, unrepresentedProbability: 0, recommendation: recommendationFor(best) };
}

/** Evaluates canonical parameterized markets using one coherent verified grid.
 * The source-resolved legacy results survive independently. Odds, provider advice
 * and diagnostic period artifacts supply no numerical market authority here. */
export function evaluateForecastMarkets(input: ForecastMarketEvaluatorInput) {
  const state = qualifiedGoalState(input);
  const published = new Map(input.localFirst ? input.publishedLocalMarkets?.map((row) => [row.definition.key, row]) ?? [] : []);
  const markets = (input.localFirst ? localFirstGoalMarkets : goalMarkets).map((row) => {
    const { definition, family } = row;
    const identity = { family, marketKey: definition.key, period: definition.period };
    if (input.localFirst && !isEligibleLocalFirstGoalDefinition(definition)) return unavailable(identity, "outside-full-match-totals-range");
    if (input.localFirst && (definition.key.startsWith("goal:full-time:goal-range:") || family === "clean-sheet" || family === "team-to-score"))
      return unavailable(identity, "unsupported-publication-projection");
    const legacyFamily = legacyByKey.get(definition.key);
    const local = publishedLocalKeys.has(definition.key) ? published.get(definition.key) : undefined;
    if (legacyFamily) {
      const market = input.candidateMarkets[legacyFamily];
      if (market.available || !local && ("reason" in state || !state.qualified.has(definition.key))) {
        return evaluateLegacy(identity, definition, legacyFamily, market);
      }
    }
    if (local) return evaluatePublishedLocalMarket(identity, definition, local);
    return evaluateRegisteredGoal(row, identity, state);
  });
  for (const family of otherFamilies) {
    const { settlement, models } = marketRegistry[family], identity = { family, marketKey: `registry:${family}`, period: null };
    markets.push(settlement.basis === "unsupported" ? unavailable(identity, "unsupported-settlement", settlement.reason) :
      unavailable(identity, "no-qualified-market-model", models.basis === "unsupported" ? models.reason : undefined));
  }
  return freezeEvidence({ version: input.localFirst ? LOCAL_FIRST_FORECAST_MARKET_EVALUATION_VERSION : FORECAST_MARKET_EVALUATION_VERSION,
    registryVersion: input.localFirst ? LOCAL_FIRST_MARKET_REGISTRY_VERSION : MARKET_REGISTRY_VERSION, markets });
}
