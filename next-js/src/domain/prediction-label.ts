import { createMessages, type Messages, type TextKey } from "../i18n/messages.ts";
import type { GoalRule } from "./score-distribution-markets.ts";
import type { NonGoalRule } from "./non-goal-market-definitions.ts";

type LabelMessages = Pick<Messages, "text">;
type Result = "home" | "draw" | "away";
export type PredictionLabelContext = Readonly<{ marketKey?: string; label?: string; line?: number; rule?: GoalRule | NonGoalRule }>;

const selectionAliases: Readonly<Record<string, string>> = {
  "1": "home-win", x: "draw", "2": "away-win", "1x": "home-or-draw", x1: "home-or-draw",
  x2: "away-or-draw", "2x": "away-or-draw", "12": "home-or-away", "21": "home-or-away",
  home: "home-win", away: "away-win", "home-draw": "home-or-draw", "draw-home": "home-or-draw",
  "draw-away": "away-or-draw", "away-draw": "away-or-draw", "home-away": "home-or-away", "away-home": "home-or-away",
};
const coreSelections = new Set(["home-win", "draw", "away-win", "home-or-draw", "away-or-draw", "home-or-away", "yes", "no"] as const);
type CoreSelection = typeof coreSelections extends Set<infer Selection> ? Selection : never;
const result = (messages: LabelMessages, value: Result) => messages.text(value === "draw" ? "market.selection.draw" : `market.selection.${value}-win`);
const signedLine = (line: number) => line > 0 ? `+${line}` : String(line);
const lineLabel = (messages: LabelMessages, direction: "over" | "under", line: number) =>
  messages.text(`market.selection.${direction}`, { line: String(line) });

const compactKeys: Readonly<Partial<Record<TextKey, TextKey>>> = {
  "market.selection.home-win": "prediction.short.home-win",
  "market.selection.draw": "prediction.short.draw",
  "market.selection.away-win": "prediction.short.away-win",
  "market.selection.home-or-draw": "prediction.short.home-or-draw",
  "market.selection.away-or-draw": "prediction.short.away-or-draw",
  "market.selection.home-or-away": "prediction.short.home-or-away",
  "market.selection.over": "prediction.short.over",
  "market.selection.under": "prediction.short.under",
  "market.selection.yes": "market.selection.answer.yes",
  "market.selection.no": "market.selection.answer.no",
  "market.selection.home-clean-sheet": "market.selection.answer.yes",
  "market.selection.away-clean-sheet": "market.selection.answer.yes",
  "market.selection.home-concede": "market.selection.answer.no",
  "market.selection.away-concede": "market.selection.answer.no",
  "market.selection.home-win-to-nil": "market.selection.answer.yes",
  "market.selection.away-win-to-nil": "market.selection.answer.yes",
  "market.selection.home-not-win-to-nil": "market.selection.answer.no",
  "market.selection.away-not-win-to-nil": "market.selection.answer.no",
  "market.selection.home-handicap": "prediction.short.home-handicap",
  "market.selection.away-handicap": "prediction.short.away-handicap",
  "market.selection.exact-count": "prediction.short.exact-count",
  "market.selection.other-count": "prediction.short.other",
  "market.selection.other-score": "prediction.short.other",
  "market.selection.none-of": "prediction.short.other",
  "market.selection.and": "prediction.short.and",
  "market.selection.home-team": "prediction.short.home-team",
  "market.selection.away-team": "prediction.short.away-team",
  "market.selection.no-event": "prediction.short.no-event",
};

function compactMessages(messages: LabelMessages): LabelMessages {
  return { text: (key, values) => messages.text(compactKeys[key] ?? key, values) };
}

function ruleLabel(messages: LabelMessages, rule: GoalRule | NonGoalRule): string {
  switch (rule.kind) {
    case "result": case "handicap-result": return result(messages, rule.result);
    case "double-chance":
      return messages.text(rule.results.includes("home") ? rule.results.includes("draw")
        ? "market.selection.home-or-draw" : "market.selection.home-or-away" : "market.selection.away-or-draw");
    case "total": case "asian-total": return lineLabel(messages, rule.direction, rule.line);
    case "both-teams-score": return messages.text(rule.yes ? "market.selection.yes" : "market.selection.no");
    case "odd-even": return messages.text(rule.odd ? "market.selection.odd" : "market.selection.even");
    case "clean-sheet": return messages.text(`market.selection.${rule.team}-${rule.yes ? "clean-sheet" : "concede"}`);
    case "win-to-nil": return messages.text(`market.selection.${rule.team}-${rule.yes ? "win-to-nil" : "not-win-to-nil"}`);
    case "asian-handicap": return messages.text(`market.selection.${rule.team}-handicap`, { line: signedLine(rule.line) });
    case "exact-score": return messages.text("market.selection.exact-score", { home: String(rule.home), away: String(rule.away) });
    case "half-full-result": return messages.text("market.selection.half-full", { half: result(messages, rule.half), full: result(messages, rule.full) });
    case "all": return rule.rules.map((part) => ruleLabel(messages, part)).join(messages.text("market.selection.and"));
    case "none": return rule.rules.every((part) => part.kind === "exact-score") ? messages.text("market.selection.other-score")
      : messages.text("market.selection.none-of");
    case "exact-count": return messages.text("market.selection.exact-count", { count: String(rule.count) });
    case "other-count": return messages.text("market.selection.other-count");
    case "event-occurs": return messages.text(rule.yes ? "market.selection.answer.yes" : "market.selection.answer.no");
    case "event-team": return messages.text(rule.team === "none" ? "market.selection.no-event" : `market.selection.${rule.team}-team`);
  }
}

/** Display text comes from settlement semantics, with every line preserved and no participant-name substitution. */
export function predictionRuleLabel(rule: GoalRule | NonGoalRule, messages: LabelMessages = createMessages("en")): string {
  return ruleLabel(messages, rule);
}

function extendedLabel(messages: LabelMessages, selection: string, context: PredictionLabelContext): string | null {
  const parts = context.marketKey?.split(":") ?? [];
  const goal = parts[0] === "goal", implied = parts[0] === "implied";
  if (!goal && !implied) return null;
  const kind = parts[goal ? 2 : 3];
  if (kind === "combination") return context.label ?? null;
  const line = context.line ?? Number(parts[goal ? kind === "totals" ? 4 : 3 : 5]);
  if (kind === "totals" || kind === "asian-total") {
    return (selection === "over" || selection === "under") && Number.isFinite(line) ? lineLabel(messages, selection, line) : null;
  }
  if (kind === "asian-handicap" && (selection === "home" || selection === "away") && Number.isFinite(line)) {
    return messages.text(`market.selection.${selection}-handicap`, { line: signedLine(selection === "home" ? line : -line) });
  }
  if (kind === "half-full-result") {
    const [half, full] = selection.split("-");
    if ((half === "home" || half === "draw" || half === "away") && (full === "home" || full === "draw" || full === "away")) {
      return messages.text("market.selection.half-full", { half: result(messages, half), full: result(messages, full) });
    }
  }
  if (kind === "exact-count") {
    return /^\d+$/u.test(selection) ? messages.text("market.selection.exact-count", { count: selection })
      : selection === "other" ? messages.text("market.selection.other-count") : null;
  }
  if (kind === "exact-score") {
    const score = /^(\d+)[-:](\d+)$/u.exec(selection);
    return score ? messages.text("market.selection.exact-score", { home: score[1]!, away: score[2]! })
      : selection === "other" ? messages.text("market.selection.other-score") : null;
  }
  if ((kind === "clean-sheet" || kind === "win-to-nil") && (selection === "yes" || selection === "no")) {
    const team = parts[3];
    if (team === "home" || team === "away") return ruleLabel(messages, { kind, team, yes: selection === "yes" });
  }
  if (kind?.endsWith("-event-team") && (selection === "home" || selection === "away" || selection === "none")) {
    return messages.text(selection === "none" ? "market.selection.no-event" : `market.selection.${selection}-team`);
  }
  if (kind?.startsWith("event-") && (selection === "yes" || selection === "no")) {
    return messages.text(`market.selection.answer.${selection}`);
  }
  return null;
}

function formatPrediction(messages: LabelMessages, selection: string, context: PredictionLabelContext): string {
  if (context.rule) return ruleLabel(messages, context.rule);
  const value = selection.trim().toLowerCase();
  const extended = extendedLabel(messages, value, context);
  if (extended !== null) return extended;
  const canonical = Object.hasOwn(selectionAliases, value) ? selectionAliases[value]! : value;
  if (coreSelections.has(canonical as CoreSelection)) return messages.text(`market.selection.${canonical as CoreSelection}`);
  const total = /^(over|under|o|u)[\s:_-]*(\d+(?:\.\d+)?)$/u.exec(value);
  if (total) return lineLabel(messages, total[1] === "over" || total[1] === "o" ? "over" : "under", Number(total[2]));
  if ((value === "over" || value === "under") && Number.isFinite(context.line)) return lineLabel(messages, value, context.line!);
  if (value === "odd" || value === "even") return messages.text(`market.selection.${value}`);
  // Custom source-mapped combinations already carry descriptive labels; preserve their exact stated event.
  return context.label ?? selection;
}

/** Compact display codes; every supported structured rule retains its line, score or settlement choice. */
export function predictionLabel(messages: LabelMessages, selection: string, context: PredictionLabelContext = {}): string {
  return formatPrediction(compactMessages(messages), selection, context);
}

/** Readable card wording retains the selection's rules and lines; boolean picks stay Yes/No. */
export function predictionText(messages: LabelMessages, selection: string, context: PredictionLabelContext = {}): string {
  const words: LabelMessages = { text: (key, values) => messages.text(key === "market.selection.yes"
    ? "market.selection.answer.yes" : key === "market.selection.no" ? "market.selection.answer.no" : key, values) };
  return formatPrediction(words, selection, context);
}

/** Human-readable meaning for tooltips, screen readers and the prediction key. */
export function predictionDescription(messages: LabelMessages, selection: string, context: PredictionLabelContext = {}): string {
  const descriptions: LabelMessages = { text: (key, values) => messages.text(key === "market.selection.yes"
    ? "prediction.definition.yes" : key === "market.selection.no" ? "prediction.definition.no"
      : key === "market.selection.answer.yes" ? "prediction.definition.event-yes"
        : key === "market.selection.answer.no" ? "prediction.definition.event-no" : key, values) };
  return formatPrediction(descriptions, selection, context);
}

/** A single definition supplies both short text and its accessible explanation. */
export function predictionOutcome(messages: LabelMessages, selection: string, context: PredictionLabelContext = {}): Readonly<{ label: string; description: string }> {
  return { label: predictionLabel(messages, selection, context), description: predictionDescription(messages, selection, context) };
}
