import { z } from "zod";
import { isPlayedFinalStatus, settlementStatuses, type CycleEligibility, type SettlementStatus } from "./market-settlement.ts";
import { asianPayoutGrade, type ExtendedMarketGrade } from "./market-payout.ts";
import { poisson } from "./poisson.ts";
import { parseScoreDistribution, type ScoreDistribution, type ScoreState } from "./score-distribution.ts";

export const GOAL_MARKET_RULE_VERSION = "score-derived-goal-markets-v1";
export const GOAL_DERIVATION_TAIL_BOUND = 1e-6;
export const goalMarketPeriods = ["full-time", "half-time", "second-half"] as const;
export type GoalMarketPeriod = typeof goalMarketPeriods[number];
const team = z.enum(["home", "away"]), result = z.enum(["home", "draw", "away"]);
const metric = z.enum(["total", "home", "away"]);
const halfLine = z.number().finite().min(0).max(1000).refine((value) => Number.isSafeInteger(value * 2) && !Number.isInteger(value));
const quarterLine = z.number().finite().min(-1000).max(1000).refine((value) => Number.isSafeInteger(value * 4));
const goals = z.number().int().min(0).max(1000);
const binaryRuleSchema = z.union([
  z.strictObject({ kind: z.literal("result"), result }),
  z.strictObject({ kind: z.literal("double-chance"), results: z.array(result).length(2).refine((values) => new Set(values).size === 2) }),
  z.strictObject({ kind: z.literal("total"), metric, direction: z.enum(["over", "under"]), line: halfLine }),
  z.strictObject({ kind: z.literal("both-teams-score"), yes: z.boolean() }),
  z.strictObject({ kind: z.literal("odd-even"), metric, odd: z.boolean() }),
  z.strictObject({ kind: z.literal("goal-count"), metric, min: goals, max: goals.nullable() })
    .refine(({ min, max }) => max === null || max >= min),
  z.strictObject({ kind: z.literal("clean-sheet"), team, yes: z.boolean() }),
  z.strictObject({ kind: z.literal("win-to-nil"), team, yes: z.boolean() }),
  z.strictObject({ kind: z.literal("exact-score"), home: goals, away: goals }),
  z.strictObject({ kind: z.literal("handicap-result"), homeHandicap: z.number().int().min(-1000).max(1000), result }),
  z.strictObject({ kind: z.literal("half-full-result"), half: result, full: result }),
  z.strictObject({ kind: z.literal("highest-scoring-half"), half: z.enum(["first-half", "equal", "second-half"]) }),
  z.strictObject({ kind: z.literal("scoring-in-both-halves"), metric, yes: z.boolean() }),
]);
export const goalRuleSchema = z.union([
  binaryRuleSchema,
  z.strictObject({ kind: z.literal("all"), rules: z.array(binaryRuleSchema).min(2).max(8) }),
  z.strictObject({ kind: z.literal("none"), rules: z.array(binaryRuleSchema).min(1).max(999) }),
  z.strictObject({ kind: z.literal("asian-handicap"), team, line: quarterLine }),
  z.strictObject({ kind: z.literal("asian-total"), metric, direction: z.enum(["over", "under"]), line: quarterLine.refine((value) => value >= 0) }),
]);
type BinaryRule = z.infer<typeof binaryRuleSchema>;
export type GoalRule = Readonly<z.infer<typeof goalRuleSchema>>;
const text = z.string().trim().min(1).max(128).refine((value) => !/[\p{Cc}<>]/u.test(value));
export const goalMarketDefinitionSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,127}$/u), label: text, code: text.max(16),
  period: z.enum(goalMarketPeriods), group: z.enum(["partition", "overlapping", "payout"]),
  selections: z.array(z.strictObject({ key: text.max(64), label: text, rule: goalRuleSchema })).min(2).max(1000),
}).superRefine((definition, context) => {
  const keys = definition.selections.map((selection) => selection.key);
  const payout = definition.selections.some(({ rule }) => rule.kind === "asian-handicap" || rule.kind === "asian-total");
  const atoms = definition.selections.flatMap(({ rule }) => rule.kind === "all" || rule.kind === "none" ? [...rule.rules] : [rule]);
  const crossPeriod = atoms.some(({ kind }) => kind === "highest-scoring-half" || kind === "scoring-in-both-halves");
  if (new Set(keys).size !== keys.length || (definition.group === "payout") !== payout || atoms.length > 2048 ||
    (crossPeriod && definition.period !== "full-time")) {
    context.addIssue({ code: "custom", message: "Selection keys must be unique and payout groups must retain their Asian settlement semantics." });
  }
});
export type GoalMarketDefinition = Readonly<z.infer<typeof goalMarketDefinitionSchema>>;
export const localPoissonRatesSchema = z.strictObject({ home: z.number().finite().min(0.05).max(6), away: z.number().finite().min(0.05).max(6),
  firstHalfShare: z.strictObject({ home: z.number().gt(0).lt(1), away: z.number().gt(0).lt(1) }).optional() });
export type LocalPoissonRates = Readonly<z.infer<typeof localPoissonRatesSchema>>;
export type GoalGrade = ExtendedMarketGrade;
const grades: readonly GoalGrade[] = ["win", "half-win", "push", "half-loss", "loss"];
export type GoalSelectionProbabilities = Readonly<{
  key: string; label: string; rule: GoalRule; winProbability: number;
  outcomes: Readonly<Record<GoalGrade, number>>;
}>;
export type DerivedGoalMarket = Readonly<{
  ruleVersion: typeof GOAL_MARKET_RULE_VERSION; source: "ai-score-distribution" | "local-poisson";
  definition: GoalMarketDefinition; selections: readonly GoalSelectionProbabilities[];
  selection: string; selectedProbability: number;
}>;
export type GoalDerivationResult = Readonly<{ available: true; market: DerivedGoalMarket }> |
  Readonly<{ available: false; reason: "invalid-definition" | "invalid-distribution" | "unrepresented-score-mass" |
    "missing-half-time-distribution" | "incomplete-partition" }>;
type GoalDerivationFailure = Extract<GoalDerivationResult, { available: false }>;
type GoalSelectionMass = Omit<GoalSelectionProbabilities, "winProbability">;
export type BoundedGoalDerivationResult = Readonly<{
  available: true; ruleVersion: typeof GOAL_MARKET_RULE_VERSION; definition: GoalMarketDefinition;
  selections: readonly GoalSelectionMass[]; unrepresentedProbability: number;
}> | GoalDerivationFailure;

/** The sum of the local model's independent regulation goal counts is Poisson.
 * Compute P(0)+P(1) exactly for this reviewed market, including the full tail. */
export function deriveLocalPoissonTotal15(rates: z.infer<typeof localPoissonRatesSchema>, definition: GoalMarketDefinition): DerivedGoalMarket {
  const total = rates.home + rates.away, under = Math.exp(-total) * (1 + total);
  const selections = definition.selections.map((selection, index) => {
    const winProbability = index === 0 ? 1 - under : under;
    return Object.freeze({ ...selection, winProbability, outcomes: Object.freeze({
      win: winProbability, loss: 1 - winProbability, "half-win": 0, "half-loss": 0, push: 0,
    }) });
  });
  const selected = selections.reduce((best, item) => item.winProbability > best.winProbability ? item : best);
  return Object.freeze({ ruleVersion: GOAL_MARKET_RULE_VERSION, source: "local-poisson", definition,
    selections: Object.freeze(selections), selection: selected.key, selectedProbability: selected.winProbability });
}

function negatedGoalCount(rule: GoalRule): Extract<GoalRule, { kind: "goal-count" }> | null {
  if (rule.kind === "none" && rule.rules.length === 1 && rule.rules[0]?.kind === "goal-count") {
    return rule.rules[0];
  }
  return null;
}

const localRegulationScoreMaximum = 40;
const supportedExactScore = (rule: GoalRule) => rule.kind === "exact-score" &&
  rule.home <= localRegulationScoreMaximum && rule.away <= localRegulationScoreMaximum;

function localRegulationScoreSupport({ period, selections }: GoalMarketDefinition) {
  if (period !== "full-time") return null;
  if (selections.every(({ rule }) => supportedExactScore(rule) || rule.kind === "none" && rule.rules.every(supportedExactScore))) return "exact-score";
  if (selections.every(({ rule }) => rule.kind === "asian-handicap" || rule.kind === "handicap-result")) return "margin";
  if (selections.every(({ rule }) => rule.kind === "win-to-nil")) return "win-to-nil";
  return null;
}

/** The sum of two independent Poisson counts is Poisson. The half rates use the
 * observed first-half shares of each side from verified point-in-time results. */
export function deriveLocalGoalMarket(rates: LocalPoissonRates, definition: GoalMarketDefinition,
  ranking: "any-win" | "outright-win" = "any-win"): GoalDerivationResult {
  if (ranking === "any-win" && definition.key === "goal:full-time:totals:total:1.5:binary")
    return { available: true, market: deriveLocalPoissonTotal15(rates, definition) };
  const scoreSupport = ranking === "outright-win" ? localRegulationScoreSupport(definition) : null;
  if (scoreSupport) return deriveLocalRegulationScoreMarket(rates, definition, scoreSupport);
  const share = rates.firstHalfShare;
  if (definition.period !== "full-time" && share === undefined) return { available: false, reason: "missing-half-time-distribution" };
  const rate = (side: "home" | "away") => rates[side] * (definition.period === "full-time" ? 1
    : definition.period === "half-time" ? share![side] : 1 - share![side]);
  const selections: GoalSelectionProbabilities[] = [];
  for (const selection of definition.selections) {
    const complement = ranking === "outright-win" ? negatedGoalCount(selection.rule) : null;
    const rule = complement ?? selection.rule;
    if (rule.kind !== "total" && rule.kind !== "asian-total" && rule.kind !== "odd-even" && rule.kind !== "goal-count")
      return { available: false, reason: "invalid-definition" };
    const lambda = rule.metric === "total" ? rate("home") + rate("away") : rate(rule.metric);
    const outcomes = { win: 0, loss: 0, "half-win": 0, "half-loss": 0, push: 0 };
    if (rule.kind === "odd-even") {
      const even = (1 + Math.exp(-2 * lambda)) / 2;
      outcomes.win = rule.odd ? 1 - even : even;
      outcomes.loss = 1 - outcomes.win;
    } else {
      let cutoff = rule.kind === "goal-count" ? rule.max ?? rule.min : Math.ceil(rule.line);
      const gradeCount = (count: number): GoalGrade => {
        if (rule.kind === "goal-count") {
          const inside = count >= rule.min && (rule.max === null || count <= rule.max);
          return inside === (complement === null) ? "win" : "loss";
        }
        const direction = rule.direction === "over" ? 1 : -1;
        if (rule.kind === "asian-total") return asianPayoutGrade(rule.line, (line) => (count - line) * direction);
        return (count - rule.line) * direction > 0 ? "win" : "loss";
      };
      const tailGrade = gradeCount(cutoff + 1);
      // The new profile uses the same tail boundary for identical outright events across payout lines.
      if (ranking === "outright-win") while (cutoff >= 0 && gradeCount(cutoff) === tailGrade) cutoff--;
      let mass = Math.exp(-lambda), represented = 0;
      for (let count = 0; count <= cutoff; count++) {
        outcomes[gradeCount(count)] += mass;
        represented += mass;
        mass *= lambda / (count + 1);
      }
      outcomes[tailGrade] += Math.max(0, 1 - represented);
    }
    if (ranking === "outright-win") for (const outcome of grades) outcomes[outcome] = Math.min(1, outcomes[outcome]);
    const winProbability = ranking === "outright-win" ? outcomes.win : Math.min(1, outcomes.win + outcomes["half-win"]);
    selections.push(Object.freeze({ ...selection, outcomes: Object.freeze(outcomes), winProbability }));
  }
  const selected = selections.reduce((best, item) => item.winProbability > best.winProbability ||
    ranking === "outright-win" && item.winProbability === best.winProbability && item.key < best.key ? item : best);
  return { available: true, market: Object.freeze({ ruleVersion: GOAL_MARKET_RULE_VERSION, source: "local-poisson", definition,
    selections: Object.freeze(selections), selection: selected.key, selectedProbability: selected.winProbability }) };
}

function score(state: ScoreState, period: GoalMarketPeriod): Readonly<{ home: number; away: number }> | null {
  if (period === "full-time") return state;
  if (state.halfHome === null || state.halfAway === null) return null;
  return period === "half-time" ? { home: state.halfHome, away: state.halfAway }
    : { home: state.home - state.halfHome, away: state.away - state.halfAway };
}
function resultOf(home: number, away: number): "home" | "draw" | "away" {
  return home > away ? "home" : home < away ? "away" : "draw";
}
function amount(value: Readonly<{ home: number; away: number }>, field: "home" | "away" | "total"): number {
  return field === "total" ? value.home + value.away : value[field];
}
function binary(state: ScoreState, period: GoalMarketPeriod, rule: BinaryRule): boolean | null {
  const value = score(state, period);
  if (!value) return null;
  const { home, away } = value;
  switch (rule.kind) {
    case "result": return resultOf(home, away) === rule.result;
    case "double-chance": return rule.results.includes(resultOf(home, away));
    case "total": return rule.direction === "over" ? amount(value, rule.metric) > rule.line : amount(value, rule.metric) < rule.line;
    case "both-teams-score": return (home > 0 && away > 0) === rule.yes;
    case "odd-even": return (amount(value, rule.metric) % 2 === 1) === rule.odd;
    case "goal-count": {
      const count = amount(value, rule.metric);
      return count >= rule.min && (rule.max === null || count <= rule.max);
    }
    case "clean-sheet": return (value[rule.team === "home" ? "away" : "home"] === 0) === rule.yes;
    case "win-to-nil": return (resultOf(home, away) === rule.team && value[rule.team === "home" ? "away" : "home"] === 0) === rule.yes;
    case "exact-score": return home === rule.home && away === rule.away;
    case "handicap-result": return resultOf(home + rule.homeHandicap, away) === rule.result;
    case "half-full-result": return state.halfHome === null || state.halfAway === null ? null
      : resultOf(state.halfHome, state.halfAway) === rule.half && resultOf(state.home, state.away) === rule.full;
    case "highest-scoring-half": {
      const first = score(state, "half-time"), second = score(state, "second-half");
      if (!first || !second) return null;
      const firstTotal = amount(first, "total"), secondTotal = amount(second, "total");
      return (firstTotal > secondTotal ? "first-half" : firstTotal < secondTotal ? "second-half" : "equal") === rule.half;
    }
    case "scoring-in-both-halves": {
      const first = score(state, "half-time"), second = score(state, "second-half");
      return first && second ? (amount(first, rule.metric) > 0 && amount(second, rule.metric) > 0) === rule.yes : null;
    }
  }
}
function grade(state: ScoreState, period: GoalMarketPeriod, rule: GoalRule): GoalGrade | null {
  if (rule.kind === "all" || rule.kind === "none") {
    const values = rule.rules.map((item) => binary(state, period, item));
    return values.includes(null) ? null : (rule.kind === "all" ? values.every(Boolean) : !values.some(Boolean)) ? "win" : "loss";
  }
  if (rule.kind === "asian-handicap" || rule.kind === "asian-total") {
    const value = score(state, period);
    if (!value) return null;
    return rule.kind === "asian-handicap"
      ? asianPayoutGrade(rule.line, (line) => (rule.team === "home" ? value.home - value.away : value.away - value.home) + line)
      : asianPayoutGrade(rule.line, (line) => (amount(value, rule.metric) - line) * (rule.direction === "over" ? 1 : -1));
  }
  const won = binary(state, period, rule);
  return won === null ? null : won ? "win" : "loss";
}

/** Grade a reviewed selection against the score as it stands, without settling the prediction. */
export function goalSelectionGradeAtScore(definition: GoalMarketDefinition, selection: string,
  score: Readonly<{ home: number; away: number }>, halfTime: Readonly<{ home: number; away: number }> | null = null): GoalGrade | null {
  const pick = definition.selections.find(({ key }) => key === selection);
  return pick ? grade({ ...score, halfHome: halfTime?.home ?? null, halfAway: halfTime?.away ?? null, probability: 1 },
    definition.period, pick.rule) : null;
}

function scoreSelectionMass(definition: GoalMarketDefinition, states: readonly ScoreState[], unrepresentedProbability: number): BoundedGoalDerivationResult {
  const selections: GoalSelectionMass[] = [];
  // Partition validity is per score. Overlaps cannot cancel gaps in the aggregate.
  const membership = definition.group === "partition" ? new Uint16Array(states.length) : null;
  for (const selection of definition.selections) {
    const outcomes = Object.fromEntries(grades.map((item) => [item, 0])) as Record<GoalGrade, number>;
    for (let index = 0; index < states.length; index++) {
      const state = states[index]!;
      const value = grade(state, definition.period, selection.rule);
      if (value === null) return { available: false, reason: "missing-half-time-distribution" };
      outcomes[value] += state.probability;
      if (membership && value === "win") membership[index]!++;
    }
    // The validated total has a floating-point tolerance. Bound only representational overflow;
    // never redistribute or discard the explicit unknown mass.
    const bounded = Object.fromEntries(grades.map((item) => [item, Math.min(1, outcomes[item])])) as Record<GoalGrade, number>;
    selections.push(Object.freeze({ ...selection, outcomes: Object.freeze(bounded) }));
  }
  if (membership?.some((count) => count !== 1)) {
    return { available: false, reason: "incomplete-partition" };
  }
  return Object.freeze({ available: true, ruleVersion: GOAL_MARKET_RULE_VERSION, definition,
    selections: Object.freeze(selections), unrepresentedProbability });
}

const localRegulationScores = new WeakMap<LocalPoissonRates, {
  home: number; away: number; homeMass: readonly number[]; awayMass: readonly number[]; marginStates?: readonly ScoreState[];
}>();
const scoreState = (home: number, away: number, probability: number): ScoreState => ({ home, away, halfHome: null, halfAway: null, probability });

function exactScoreStates(definition: GoalMarketDefinition, homeMass: readonly number[], awayMass: readonly number[]) {
  const states = new Map<string, ScoreState>();
  for (const { rule } of definition.selections) for (const score of rule.kind === "none" ? rule.rules : [rule]) {
    if (score.kind !== "exact-score") continue;
    const { home, away } = score;
    states.set(`${home}:${away}`, scoreState(home, away, (homeMass[home] ?? 0) * (awayMass[away] ?? 0)));
  }
  const exact = [...states.values()];
  // Every unlisted score has the same grade for exact-score and complementary selections.
  const other = Math.max(0, 1 - exact.reduce((sum, state) => sum + state.probability, 0));
  return [...exact, scoreState(1 + Math.max(...exact.map(({ home }) => home)), 0, other)];
}

function scoreMarginStates(homeMass: readonly number[], awayMass: readonly number[]) {
  const offset = awayMass.length - 1, masses = Array<number>(homeMass.length + offset).fill(0);
  for (const [home, homeProbability] of homeMass.entries()) for (const [away, awayProbability] of awayMass.entries()) {
    masses[home - away + offset]! += homeProbability * awayProbability;
  }
  const total = masses.reduce((sum, probability) => sum + probability, 0);
  return masses.map((probability, index) => scoreState(Math.max(0, index - offset), Math.max(0, offset - index), probability / total));
}

function deriveLocalRegulationScoreMarket(rates: LocalPoissonRates, definition: GoalMarketDefinition,
  support: NonNullable<ReturnType<typeof localRegulationScoreSupport>>): GoalDerivationResult {
  let model = localRegulationScores.get(rates);
  if (!model || model.home !== rates.home || model.away !== rates.away) {
    if (!localPoissonRatesSchema.safeParse(rates).success) return { available: false, reason: "invalid-distribution" };
    // At the maximum supported rate six, either team exceeding 40 goals has joint tail bound < 1.4e-20.
    model = { home: rates.home, away: rates.away, homeMass: poisson(rates.home, localRegulationScoreMaximum),
      awayMass: poisson(rates.away, localRegulationScoreMaximum) };
    localRegulationScores.set(rates, model);
  }
  const { homeMass, awayMass } = model;
  const homeZero = homeMass[0]!, awayZero = awayMass[0]!;
  const states = support === "margin" ? model.marginStates ??= scoreMarginStates(homeMass, awayMass)
    : support === "exact-score" ? exactScoreStates(definition, homeMass, awayMass)
      : [scoreState(0, 0, homeZero * awayZero), scoreState(0, 1, homeZero * (1 - awayZero)),
        scoreState(1, 0, (1 - homeZero) * awayZero), scoreState(1, 1, (1 - homeZero) * (1 - awayZero))];
  const result = scoreSelectionMass(definition, states, 0);
  if (!result.available) return result;
  const selections = result.selections.map((selection) => Object.freeze({ ...selection, winProbability: selection.outcomes.win }));
  const selected = selections.reduce((best, item) => item.winProbability > best.winProbability ||
    item.winProbability === best.winProbability && item.key < best.key ? item : best);
  return { available: true, market: Object.freeze({ ruleVersion: GOAL_MARKET_RULE_VERSION, source: "local-poisson", definition,
    selections: Object.freeze(selections), selection: selected.key, selectedProbability: selected.winProbability }) };
}

function deriveGoalSelectionMass(
  distributionInput: unknown, definitionInput: unknown, allowBoundedTail: boolean,
): BoundedGoalDerivationResult {
  const parsed = goalMarketDefinitionSchema.safeParse(definitionInput);
  if (!parsed.success) return { available: false, reason: "invalid-definition" };
  let distribution: ScoreDistribution;
  try { distribution = parseScoreDistribution(distributionInput); } catch { return { available: false, reason: "invalid-distribution" }; }
  if (distribution.unrepresentedProbability >= GOAL_DERIVATION_TAIL_BOUND ||
    (!allowBoundedTail && distribution.unrepresentedProbability !== 0)) return { available: false, reason: "unrepresented-score-mass" };
  return scoreSelectionMass(freezeDefinition(parsed.data), distribution.states, distribution.unrepresentedProbability);
}

/** Derives complete probabilities for callers that require all joint mass. */
export function deriveGoalMarket(distributionInput: unknown, definitionInput: unknown): GoalDerivationResult {
  const derived = deriveGoalSelectionMass(distributionInput, definitionInput, false);
  if (!derived.available) return derived;
  const selections = derived.selections.map((selection) => Object.freeze({ ...selection,
    winProbability: Math.min(1, selection.outcomes.win + selection.outcomes["half-win"]) }));
  const selected = selections.reduce((best, item) => item.winProbability > best.winProbability ? item : best);
  return { available: true, market: Object.freeze({ ruleVersion: GOAL_MARKET_RULE_VERSION, source: "ai-score-distribution",
    definition: derived.definition, selections: Object.freeze(selections), selection: selected.key, selectedProbability: selected.winProbability }) };
}

/** Each grade is a lower probability bound; the reported tail may belong to any grade. */
export function deriveBoundedGoalMarket(distributionInput: unknown, definitionInput: unknown): BoundedGoalDerivationResult {
  return deriveGoalSelectionMass(distributionInput, definitionInput, true);
}

/** Zod has already copied the input; freeze every rule/selection so a forecast cannot drift after derivation. */
export function freezeDefinition(definition: GoalMarketDefinition): GoalMarketDefinition {
  function freeze(value: unknown): void {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(definition);
  return definition;
}

export type GoalSettlementContext = Readonly<{
  status: SettlementStatus; cycleEligibility: CycleEligibility;
  regulationScore: Readonly<{ verified: boolean; period: string; home: number; away: number }> | null;
  halfTimeScore: Readonly<{ verified: boolean; period: string; home: number; away: number }> | null;
}>;
export type GoalSettlement = Readonly<{
  ruleVersion: typeof GOAL_MARKET_RULE_VERSION;
  status: "correct" | "incorrect" | "half-win" | "half-loss" | "push" | "pending" | "void" | "unavailable";
  reason: string;
}>;
const settlementContextSchema = z.strictObject({
  status: z.enum(settlementStatuses),
  cycleEligibility: z.union([z.strictObject({ eligible: z.literal(true) }), z.strictObject({ eligible: z.literal(false),
    reason: z.enum(["postponed-cycle", "cutoff-invalidated", "ineligible-cycle"]) })]),
  // Align with the provider/public fixture score bounds, independently of the predictor support cap.
  regulationScore: z.strictObject({ verified: z.boolean(), period: z.string(), home: z.number().int().min(0).max(1000), away: z.number().int().min(0).max(1000) }).nullable(),
  halfTimeScore: z.strictObject({ verified: z.boolean(), period: z.string(), home: z.number().int().min(0).max(1000), away: z.number().int().min(0).max(1000) }).nullable(),
});
/** Settlement is rerunnable against corrected verified results and never changes the supplied locked selection. */
export function settleGoalSelection(definitionInput: unknown, selected: string, contextInput: unknown): GoalSettlement {
  const output = (status: GoalSettlement["status"], reason: string): GoalSettlement => ({ ruleVersion: GOAL_MARKET_RULE_VERSION, status, reason });
  const definition = goalMarketDefinitionSchema.safeParse(definitionInput);
  const pick = definition.success ? definition.data.selections.find((item) => item.key === selected) : null;
  if (!pick || !definition.success) return output("unavailable", "unsupported-market-selection");
  const parsed = settlementContextSchema.safeParse(contextInput);
  if (!parsed.success) return output("pending", "invalid-context");
  const context = parsed.data;
  if (!context.cycleEligibility.eligible) return output("void", context.cycleEligibility.reason);
  if (["postponed", "canceled", "abandoned", "awarded"].includes(context.status)) return output("void", `fixture-${context.status}`);
  if (!isPlayedFinalStatus(context.status)) return output("pending", context.status === "unknown" ? "unknown-fixture-status" : "awaiting-final-result");
  const full = context.regulationScore;
  if (!full || !full.verified || full.period !== "regulation-including-stoppage-time") return output("pending", "missing-verified-regulation-score");
  const half = context.halfTimeScore;
  if (half && (half.home > full.home || half.away > full.away)) return output("pending", "invalid-half-time-score");
  const verifiedHalf = half?.verified && half.period === "first-half-including-stoppage-time" ? half : null;
  const value = grade({ home: full.home, away: full.away, halfHome: verifiedHalf?.home ?? null,
    halfAway: verifiedHalf?.away ?? null, probability: 1 }, definition.data.period, pick.rule);
  if (value === null) return output("pending", "missing-verified-half-time-score");
  return output(value === "win" ? "correct" : value === "loss" ? "incorrect" : value, `selection-${value}`);
}
