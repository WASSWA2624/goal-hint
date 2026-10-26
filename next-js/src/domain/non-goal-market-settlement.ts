import { z } from "zod";
import { isPlayedFinalStatus, type CycleEligibility, type SettlementStatus } from "./market-settlement.ts";
import { asianPayoutGrade, type ExtendedMarketGrade } from "./market-payout.ts";
import { goalMarketPeriods } from "./score-distribution-markets.ts";
import { countMetrics, eventMetrics, nonGoalMarketDefinitionSchema, type NonGoalMarketDefinition, type NonGoalRule } from "./non-goal-market-definitions.ts";

const count = z.number().int().min(0).max(1_000_000), countingRule = z.string().min(1).max(64);
const period = z.enum(goalMarketPeriods), scope = z.literal("regulation-including-stoppage-time");
export const nonGoalResultEvidenceSchema = z.strictObject({
  counts: z.array(z.strictObject({ metric: z.enum(countMetrics), period, scope, countingRule, verified: z.boolean(), home: count.nullable(), away: count.nullable() })).max(1024),
  events: z.array(z.strictObject({ metric: z.enum(eventMetrics), period, scope, countingRule, verified: z.boolean(), complete: z.boolean(),
    entries: z.array(z.strictObject({ sequence: z.number().int().min(0).max(1_000_000), team: z.enum(["home", "away"]),
      playerId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), minute: z.number().int().min(0).max(200).nullable(),
      extra: z.number().int().min(0).max(1000).nullable() })).max(10_000),
  }).refine(({ entries }) => new Set(entries.map(({ sequence }) => sequence)).size === entries.length)).max(1024),
}).superRefine((evidence, context) => {
  for (const items of [evidence.counts, evidence.events]) {
    const keys = items.map((item) => `${item.period}:${item.metric}:${item.countingRule}`);
    if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Conflicting evidence for one period, metric and counting rule." });
  }
});
export type NonGoalResultEvidence = Readonly<z.infer<typeof nonGoalResultEvidenceSchema>>;
export type NonGoalSettlementContext = Readonly<{ status: SettlementStatus; cycleEligibility: CycleEligibility;
  resultUsable: boolean; evidence: NonGoalResultEvidence | null }>;
export type NonGoalSettlementOutcome = Readonly<{ status: "correct" | "incorrect" | "half-win" | "half-loss" | "push" | "pending" | "void" | "unavailable"; reason: string }>;
const output = (status: NonGoalSettlementOutcome["status"], reason: string): NonGoalSettlementOutcome => Object.freeze({ status, reason });
const resultOf = (home: number, away: number) => home > away ? "home" : home < away ? "away" : "draw";

function gradeCount(definition: NonGoalMarketDefinition, rule: NonGoalRule, facts: NonGoalResultEvidence): ExtendedMarketGrade | string {
  const rows = facts.counts.filter((item) => item.metric === definition.metric && item.period === definition.period && item.countingRule === definition.countingRule);
  if (rows.length !== 1 || !rows[0]!.verified) return "missing-verified-statistic";
  const row = rows[0]!, home = row.home, away = row.away;
  const both = definition.scope === "total" || ["result", "double-chance", "handicap-result", "asian-handicap"].includes(rule.kind);
  if (both ? home === null || away === null : row[definition.scope === "home" ? "home" : "away"] === null) return "missing-statistic-count";
  const amount = definition.scope === "total" ? home! + away! : row[definition.scope]!;
  let won: boolean;
  switch (rule.kind) {
    case "result": won = resultOf(home!, away!) === rule.result; break;
    case "double-chance": won = rule.results.includes(resultOf(home!, away!)); break;
    case "handicap-result": won = resultOf(home! + rule.homeHandicap, away!) === rule.result; break;
    case "total": won = rule.direction === "over" ? amount > rule.line : amount < rule.line; break;
    case "odd-even": won = (amount % 2 === 1) === rule.odd; break;
    case "exact-count": won = amount === rule.count; break;
    case "other-count": won = !rule.excluded.includes(amount); break;
    case "asian-total": return asianPayoutGrade(rule.line, (line) => (amount - line) * (rule.direction === "over" ? 1 : -1));
    case "asian-handicap": return asianPayoutGrade(rule.line, (line) => (rule.team === "home" ? home! - away! : away! - home!) + line);
    default: return "unsupported-statistic-rule";
  }
  return won ? "win" : "loss";
}
function gradeEvent(definition: NonGoalMarketDefinition, rule: Extract<NonGoalRule, { kind: "event-occurs" | "event-team" }>,
  facts: NonGoalResultEvidence): ExtendedMarketGrade | string {
  const rows = facts.events.filter((item) => item.metric === definition.metric && item.period === definition.period && item.countingRule === definition.countingRule);
  if (rows.length !== 1 || !rows[0]!.verified || !rows[0]!.complete) return "missing-complete-verified-events";
  const entries = [...rows[0]!.entries].sort((a, b) => a.sequence - b.sequence);
  const observed = rule.position === "any" ? entries : [rule.position === "first" ? entries[0] : entries.at(-1)].filter((item) => item !== undefined);
  if (rule.kind === "event-team") return (observed[0]?.team ?? "none") === rule.team ? "win" : "loss";
  if (definition.playerId !== null && observed.some((entry) => entry.playerId === null)) return "missing-player-identity";
  const occurred = observed.some((entry) => (definition.scope === "total" || entry.team === definition.scope) &&
    (definition.playerId === null || definition.playerId === entry.playerId));
  return occurred === rule.yes ? "win" : "loss";
}

/** Final settlement consumes verified stored period evidence only; missing counts/events never become zero. */
export function settleNonGoalSelection(definitionInput: unknown, selection: string | null, context: NonGoalSettlementContext): NonGoalSettlementOutcome {
  const definition = nonGoalMarketDefinitionSchema.safeParse(definitionInput);
  if (!definition.success) return output("unavailable", "invalid-definition");
  const pick = definition.data.selections.find(({ key }) => key === selection);
  if (!pick) return output("unavailable", "missing-selection");
  if (context.cycleEligibility.eligible === false) return output("void", context.cycleEligibility.reason);
  if (["postponed", "canceled", "abandoned", "awarded"].includes(context.status)) return output("void", `fixture-${context.status}`);
  if (!isPlayedFinalStatus(context.status)) return output("pending", context.status === "unknown" ? "unknown-fixture-status" : "awaiting-final-result");
  if (!context.resultUsable) return output("pending", "missing-coherent-final-result");
  const facts = nonGoalResultEvidenceSchema.safeParse(context.evidence);
  if (!facts.success) return output("pending", "missing-verified-period-evidence");
  const rule = pick.rule, grade = rule.kind === "event-occurs" || rule.kind === "event-team"
    ? gradeEvent(definition.data, rule, facts.data) : gradeCount(definition.data, rule, facts.data);
  if (grade === "win") return output("correct", "selection-occurred");
  if (grade === "loss") return output("incorrect", "selection-did-not-occur");
  return grade === "half-win" || grade === "half-loss" || grade === "push" ? output(grade, `selection-${grade}`) : output("pending", grade);
}

/** New source-specific reporting cannot feed the four-family AI/fallback headline. Half grades and pushes stay separate. */
export function marketImpliedPerformance(rows: readonly Readonly<{ source: string; marketKey: string; status: NonGoalSettlementOutcome["status"]; eligibleForCounting: boolean }>[]) {
  const grouped = new Map<string, { correct: number; incorrect: number; halfWin: number; halfLoss: number; push: number }>();
  for (const row of rows) {
    if (row.source !== "market-implied" || !row.eligibleForCounting) continue;
    const total = grouped.get(row.marketKey) ?? { correct: 0, incorrect: 0, halfWin: 0, halfLoss: 0, push: 0 };
    if (row.status === "correct") total.correct++;
    else if (row.status === "incorrect") total.incorrect++;
    else if (row.status === "half-win") total.halfWin++;
    else if (row.status === "half-loss") total.halfLoss++;
    else if (row.status === "push") total.push++;
    else continue;
    grouped.set(row.marketKey, total);
  }
  return [...grouped].map(([marketKey, values]) => ({ source: "market-implied" as const, marketKey, ...values,
    denominator: values.correct + values.incorrect, hitRate: values.correct + values.incorrect ? values.correct / (values.correct + values.incorrect) : null }));
}
