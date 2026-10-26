import { z } from "zod";
import { goalMarketPeriods, type GoalMarketPeriod } from "./score-distribution-markets.ts";
import { predictionRuleLabel } from "./prediction-label.ts";

export const NON_GOAL_MARKET_RULE_VERSION = "non-goal-market-implied-v1";
export const countMetrics = ["corners", "yellow-cards", "red-cards", "cards", "booking-points", "shots-on-goal", "shots-off-goal",
  "total-shots", "blocked-shots", "shots-inside-box", "shots-outside-box", "fouls", "offsides", "goalkeeper-saves", "total-passes",
  "accurate-passes", "throw-ins", "goal-kicks", "penalties"] as const;
export type CountMetric = typeof countMetrics[number];
export const eventMetrics = ["corners", "yellow-cards", "red-cards", "cards", "penalties", "goals", "assists"] as const;
export type EventMetric = typeof eventMetrics[number];
const metric = z.enum([...countMetrics, "goals", "assists"]), scope = z.enum(["total", "home", "away"]);
const count = z.number().int().min(0).max(1_000_000);
const quarter = z.number().finite().min(-100_000).max(100_000).refine((value) => Number.isSafeInteger(value * 4));
const half = quarter.refine((value) => value >= 0 && Number.isInteger(value * 2) && !Number.isInteger(value));
const result = z.enum(["home", "draw", "away"]), position = z.enum(["any", "first", "last"]);
export const nonGoalRuleSchema = z.union([
  z.strictObject({ kind: z.literal("result"), result }),
  z.strictObject({ kind: z.literal("double-chance"), results: z.array(result).length(2).refine((values) => new Set(values).size === 2) }),
  z.strictObject({ kind: z.literal("total"), direction: z.enum(["over", "under"]), line: half }),
  z.strictObject({ kind: z.literal("asian-total"), direction: z.enum(["over", "under"]), line: quarter.refine((value) => value >= 0) }),
  z.strictObject({ kind: z.literal("asian-handicap"), team: z.enum(["home", "away"]), line: quarter }),
  z.strictObject({ kind: z.literal("handicap-result"), homeHandicap: quarter.refine(Number.isInteger), result }),
  z.strictObject({ kind: z.literal("odd-even"), odd: z.boolean() }),
  z.strictObject({ kind: z.literal("exact-count"), count }),
  z.strictObject({ kind: z.literal("other-count"), excluded: z.array(count).min(1).max(999).refine((values) => new Set(values).size === values.length) }),
  z.strictObject({ kind: z.literal("event-occurs"), position, yes: z.boolean() }),
  z.strictObject({ kind: z.literal("event-team"), position: z.enum(["first", "last"]), team: z.enum(["home", "away", "none"]) }),
]);
export type NonGoalRule = Readonly<z.infer<typeof nonGoalRuleSchema>>;
const text = z.string().min(1).max(128).refine((value) => value === value.trim() && !/[\p{Cc}<>]/u.test(value));
const kinds = ["result", "double-chance", "totals", "asian-total", "asian-handicap", "handicap-result", "odd-even", "exact-count",
  "event-any", "event-first", "event-last", "first-event-team", "last-event-team"] as const;
const identitySchema = z.strictObject({ metric, period: z.enum(goalMarketPeriods), kind: z.enum(kinds), scope,
  line: quarter.nullable(), playerId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  countingRule: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,31}$/u) });
export type NonGoalMarketIdentity = Readonly<z.infer<typeof identitySchema>>;

/** Stable machine identity never depends on translated labels or guessed provider ids. */
export function nonGoalMarketKey(identity: NonGoalMarketIdentity): string {
  return `implied:${identity.period}:${identity.metric}:${identity.kind}:${identity.scope}:${identity.line ?? "none"}:${identity.playerId ?? "all"}:${identity.countingRule}`;
}

export const nonGoalMarketDefinitionSchema = z.strictObject({ ...identitySchema.shape,
  key: z.string().regex(/^implied:[a-z0-9:._-]{1,120}$/u), label: text, code: text.max(16),
  selections: z.array(z.strictObject({ key: text.max(64), label: text, rule: nonGoalRuleSchema })).min(2).max(1000),
}).superRefine((definition, context) => {
  const rules = definition.selections.map(({ rule }) => rule), type = definition.kind;
  const has = (kind: NonGoalRule["kind"]) => rules.every((rule) => rule.kind === kind);
  const results = (kind: "result" | "handicap-result") => has(kind) && rules.length === 3 &&
    new Set(rules.map((rule) => rule.kind === kind ? rule.result : "invalid")).size === 3;
  let valid = definition.key === nonGoalMarketKey(definition) && new Set(definition.selections.map(({ key }) => key)).size === rules.length;
  if (type === "result") valid &&= results("result") && definition.scope === "total" && definition.line === null;
  else if (type === "double-chance") valid &&= has("double-chance") && rules.length === 3 && definition.scope === "total" && definition.line === null &&
    new Set(rules.map((rule) => rule.kind === "double-chance" ? [...rule.results].sort().join(",") : "invalid")).size === 3;
  else if (type === "totals" || type === "asian-total") valid &&= has(type === "totals" ? "total" : "asian-total") && rules.length === 2 &&
    rules.every((rule) => (rule.kind === "total" || rule.kind === "asian-total") && rule.line === definition.line) &&
    new Set(rules.map((rule) => "direction" in rule ? rule.direction : "invalid")).size === 2;
  else if (type === "asian-handicap") valid &&= has("asian-handicap") && rules.length === 2 && definition.scope === "total" &&
    rules.some((rule) => rule.kind === "asian-handicap" && rule.team === "home" && rule.line === definition.line) &&
    rules.some((rule) => rule.kind === "asian-handicap" && rule.team === "away" && rule.line === -definition.line!);
  else if (type === "handicap-result") valid &&= results("handicap-result") && definition.scope === "total" &&
    rules.every((rule) => rule.kind === "handicap-result" && rule.homeHandicap === definition.line);
  else if (type === "odd-even") valid &&= has("odd-even") && rules.length === 2 && definition.line === null &&
    new Set(rules.map((rule) => rule.kind === "odd-even" && rule.odd)).size === 2;
  else if (type === "exact-count") {
    const exact = rules.filter((rule) => rule.kind === "exact-count"), other = rules.filter((rule) => rule.kind === "other-count");
    valid &&= exact.length + other.length === rules.length && other.length === 1 && definition.line === null &&
      new Set(exact.map((rule) => rule.count)).size === exact.length &&
      [...other[0]!.excluded].sort((a, b) => a - b).join() === exact.map((rule) => rule.count).sort((a, b) => a - b).join();
  } else if (type.startsWith("event-")) valid &&= has("event-occurs") && rules.length === 2 && definition.line === null &&
    rules.every((rule) => rule.kind === "event-occurs" && `event-${rule.position}` === type) &&
    new Set(rules.map((rule) => rule.kind === "event-occurs" && rule.yes)).size === 2;
  else valid &&= has("event-team") && rules.length === 3 && definition.scope === "total" && definition.playerId === null && definition.line === null &&
    rules.every((rule) => rule.kind === "event-team" && `${rule.position}-event-team` === type) &&
    new Set(rules.map((rule) => rule.kind === "event-team" ? rule.team : "invalid")).size === 3;
  const event = type.startsWith("event-") || type.endsWith("-event-team");
  valid &&= event ? (eventMetrics as readonly string[]).includes(definition.metric) :
    (countMetrics as readonly string[]).includes(definition.metric) && definition.playerId === null;
  if (!valid) context.addIssue({ code: "custom", message: "Definitions require a complete known settlement partition and canonical period/metric/team/line identity." });
});
export type NonGoalMarketDefinition = Readonly<Omit<z.infer<typeof nonGoalMarketDefinitionSchema>, "selections"> & {
  selections: readonly z.infer<typeof nonGoalMarketDefinitionSchema>["selections"][number][];
}>;

type Selection = NonGoalMarketDefinition["selections"][number];
const choice = (key: string, label: string, rule: NonGoalRule): Selection => ({ key, label, rule });
const labels = { home: "Home", draw: "Draw", away: "Away" } as const;
type Options = Readonly<{ period?: GoalMarketPeriod; scope?: "total" | "home" | "away"; countingRule?: string }>;
function define(kind: NonGoalMarketIdentity["kind"], metric: NonGoalMarketIdentity["metric"], label: string, code: string,
  selections: Selection[], options: Options = {}, line: number | null = null, playerId: number | null = null): NonGoalMarketDefinition {
  const identity: NonGoalMarketIdentity = { kind, metric, period: options.period ?? "full-time", scope: options.scope ?? "total", line, playerId,
    countingRule: options.countingRule ?? "provider-reported-count-v1" };
  const parsed = nonGoalMarketDefinitionSchema.parse({ ...identity, key: nonGoalMarketKey(identity), label, code,
    selections: selections.map((selection) => ({ ...selection, label: predictionRuleLabel(selection.rule) })) });
  return Object.freeze({ ...parsed, selections: Object.freeze(parsed.selections.map((item) => Object.freeze({ ...item, rule: Object.freeze(item.rule) }))) });
}
export function nonGoalResultMarket(metric: CountMetric, options: Options = {}): NonGoalMarketDefinition {
  return define("result", metric, `${metric} · match result`, "1X2", (["home", "draw", "away"] as const)
    .map((result) => choice(result, labels[result], { kind: "result", result })), options);
}
export function nonGoalDoubleChanceMarket(metric: CountMetric, options: Options = {}): NonGoalMarketDefinition {
  return define("double-chance", metric, `${metric} · double chance`, "DC", [
    choice("home-draw", "Home / Draw", { kind: "double-chance", results: ["home", "draw"] }),
    choice("draw-away", "Draw / Away", { kind: "double-chance", results: ["draw", "away"] }),
    choice("home-away", "Home / Away", { kind: "double-chance", results: ["home", "away"] }),
  ], options);
}
export function nonGoalTotalsMarket(metric: CountMetric, line: number, options: Options = {}, asian = false): NonGoalMarketDefinition {
  return define(asian ? "asian-total" : "totals", metric, `${metric} · ${options.scope ?? "total"} · ${line}`, `O/U ${line}`,
    (["over", "under"] as const).map((direction) => choice(direction, `${direction === "over" ? "Over" : "Under"} ${line}`,
      { kind: asian ? "asian-total" : "total", direction, line })), options, line);
}
export function nonGoalAsianHandicapMarket(metric: CountMetric, homeLine: number, options: Options = {}): NonGoalMarketDefinition {
  return define("asian-handicap", metric, `${metric} · Asian handicap ${homeLine}`, "AH", [
    choice("home", `Home ${homeLine}`, { kind: "asian-handicap", team: "home", line: homeLine }),
    choice("away", `Away ${-homeLine}`, { kind: "asian-handicap", team: "away", line: -homeLine }),
  ], options, homeLine);
}
export function nonGoalHandicapMarket(metric: CountMetric, homeLine: number, options: Options = {}): NonGoalMarketDefinition {
  return define("handicap-result", metric, `${metric} · handicap ${homeLine}`, "EH", (["home", "draw", "away"] as const)
    .map((result) => choice(result, labels[result], { kind: "handicap-result", result, homeHandicap: homeLine })), options, homeLine);
}
export function nonGoalParityMarket(metric: CountMetric, options: Options = {}): NonGoalMarketDefinition {
  return define("odd-even", metric, `${metric} · odd/even`, "Odd/Even", [
    choice("odd", "Odd", { kind: "odd-even", odd: true }), choice("even", "Even", { kind: "odd-even", odd: false }),
  ], options);
}
/** Other must be explicitly offered/mapped by the provider; omitted counts are never fabricated as another selection. */
export function nonGoalExactCountMarket(metric: CountMetric, counts: readonly number[], options: Options = {}): NonGoalMarketDefinition {
  return define("exact-count", metric, `${metric} · exact count`, "Exact", [
    ...counts.map((count) => choice(String(count), String(count), { kind: "exact-count", count })),
    choice("other", "Other", { kind: "other-count", excluded: [...counts] }),
  ], options);
}
export function nonGoalEventMarket(metric: EventMetric, position: "any" | "first" | "last", options: Options = {}, playerId: number | null = null): NonGoalMarketDefinition {
  return define(`event-${position}`, metric, `${metric} · ${position} · ${options.scope ?? "total"}`, position, [
    choice("yes", "Yes", { kind: "event-occurs", position, yes: true }), choice("no", "No", { kind: "event-occurs", position, yes: false }),
  ], { ...options, countingRule: options.countingRule ?? "provider-event-v1" }, null, playerId);
}
export function nonGoalEventTeamMarket(metric: EventMetric, position: "first" | "last", options: Options = {}): NonGoalMarketDefinition {
  return define(`${position}-event-team`, metric, `${metric} · ${position} team`, position, (["home", "away", "none"] as const)
    .map((team) => choice(team, team === "none" ? "No event" : labels[team], { kind: "event-team", position, team })),
  { ...options, countingRule: options.countingRule ?? "provider-event-v1" });
}
