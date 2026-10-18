import { z } from "zod";
import { isPlayedFinalStatus, settlementStatuses, type CycleEligibility, type SettlementStatus } from "./market-settlement.ts";
import { asianPayoutGrade, type ExtendedMarketGrade } from "./market-payout.ts";
import { parseScoreDistribution, type ScoreDistribution, type ScoreState } from "./score-distribution.ts";

export const GOAL_MARKET_RULE_VERSION = "score-derived-goal-markets-v1";
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
  z.strictObject({ kind: z.literal("clean-sheet"), team, yes: z.boolean() }),
  z.strictObject({ kind: z.literal("win-to-nil"), team, yes: z.boolean() }),
  z.strictObject({ kind: z.literal("exact-score"), home: goals, away: goals }),
  z.strictObject({ kind: z.literal("handicap-result"), homeHandicap: z.number().int().min(-1000).max(1000), result }),
  z.strictObject({ kind: z.literal("half-full-result"), half: result, full: result }),
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
  const atoms = definition.selections.reduce((count, { rule }) => count + (rule.kind === "all" || rule.kind === "none" ? rule.rules.length : 1), 0);
  if (new Set(keys).size !== keys.length || (definition.group === "payout") !== payout || atoms > 2048) {
    context.addIssue({ code: "custom", message: "Selection keys must be unique and payout groups must retain their Asian settlement semantics." });
  }
});
export type GoalMarketDefinition = Readonly<z.infer<typeof goalMarketDefinitionSchema>>;
export type GoalGrade = ExtendedMarketGrade;
const grades: readonly GoalGrade[] = ["win", "half-win", "push", "half-loss", "loss"];
export type GoalSelectionProbabilities = Readonly<{
  key: string; label: string; rule: GoalRule; winProbability: number;
  outcomes: Readonly<Record<GoalGrade, number>>;
}>;
export type DerivedGoalMarket = Readonly<{
  ruleVersion: typeof GOAL_MARKET_RULE_VERSION; source: "ai-score-distribution";
  definition: GoalMarketDefinition; selections: readonly GoalSelectionProbabilities[];
  selection: string; selectedProbability: number;
}>;
export type GoalDerivationResult = Readonly<{ available: true; market: DerivedGoalMarket }> |
  Readonly<{ available: false; reason: "invalid-definition" | "invalid-distribution" | "unrepresented-score-mass" |
    "missing-half-time-distribution" | "incomplete-partition" }>;

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
    case "clean-sheet": return (value[rule.team === "home" ? "away" : "home"] === 0) === rule.yes;
    case "win-to-nil": return (resultOf(home, away) === rule.team && value[rule.team === "home" ? "away" : "home"] === 0) === rule.yes;
    case "exact-score": return home === rule.home && away === rule.away;
    case "handicap-result": return resultOf(home + rule.homeHandicap, away) === rule.result;
    case "half-full-result": return state.halfHome === null || state.halfAway === null ? null
      : resultOf(state.halfHome, state.halfAway) === rule.half && resultOf(state.home, state.away) === rule.full;
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

/** Derives only from supplied joint mass. Missing tail/half-time data never becomes zero or an independent approximation. */
export function deriveGoalMarket(distributionInput: unknown, definitionInput: unknown): GoalDerivationResult {
  const parsed = goalMarketDefinitionSchema.safeParse(definitionInput);
  if (!parsed.success) return { available: false, reason: "invalid-definition" };
  let distribution: ScoreDistribution;
  try { distribution = parseScoreDistribution(distributionInput); } catch { return { available: false, reason: "invalid-distribution" }; }
  if (distribution.unrepresentedProbability !== 0) return { available: false, reason: "unrepresented-score-mass" };
  const definition = freezeDefinition(parsed.data), selections: GoalSelectionProbabilities[] = [];
  for (const selection of definition.selections) {
    const outcomes = Object.fromEntries(grades.map((item) => [item, 0])) as Record<GoalGrade, number>;
    for (const state of distribution.states) {
      const value = grade(state, definition.period, selection.rule);
      if (value === null) return { available: false, reason: "missing-half-time-distribution" };
      outcomes[value] += state.probability;
    }
    // The validated total has a floating-point tolerance. Bound only representational overflow;
    // never redistribute or discard the explicit unknown mass.
    const bounded = Object.fromEntries(grades.map((item) => [item, Math.min(1, outcomes[item])])) as Record<GoalGrade, number>;
    selections.push(Object.freeze({ ...selection, outcomes: Object.freeze(bounded), winProbability: Math.min(1, outcomes.win + outcomes["half-win"]) }));
  }
  // Check partition membership per state, not just aggregate mass: overlaps can otherwise cancel gaps.
  if (definition.group === "partition" && distribution.states.some((state) =>
      definition.selections.filter(({ rule }) => grade(state, definition.period, rule) === "win").length !== 1)) {
    return { available: false, reason: "incomplete-partition" };
  }
  const selected = selections.reduce((best, item) => item.winProbability > best.winProbability ? item : best);
  return { available: true, market: Object.freeze({ ruleVersion: GOAL_MARKET_RULE_VERSION, source: "ai-score-distribution",
    definition, selections: Object.freeze(selections), selection: selected.key, selectedProbability: selected.winProbability }) };
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
