import { freezeDefinition, goalMarketDefinitionSchema, goalMarketPeriods, type GoalMarketDefinition, type GoalMarketPeriod, type GoalRule } from "./score-distribution-markets.ts";
import { predictionRuleLabel } from "./prediction-label.ts";

const resultLabels = { home: "Home", draw: "Draw", away: "Away" } as const;
const periodLabels = { "full-time": "Full time", "half-time": "First half", "second-half": "Second half" } as const;
const periods = { "full-time": "FT", "half-time": "HT", "second-half": "2H" } as const;
type Selection = GoalMarketDefinition["selections"][number];
const selected = (key: string, label: string, rule: GoalRule): Selection => ({ key, label, rule });

/** Definitions are keyed by period, team and line, never by a translated display label or provider id. */
function definition(kind: string, period: GoalMarketPeriod, label: string, code: string, selections: Selection[],
  group: GoalMarketDefinition["group"] = "partition"): GoalMarketDefinition {
  return freezeDefinition(goalMarketDefinitionSchema.parse({ key: `goal:${period}:${kind}`, period,
    label: `${periodLabels[period]} · ${label}`, code,
    selections: selections.map((selection) => {
      const display = predictionRuleLabel(selection.rule);
      // Stored definitions keep their original bounded description; public reads format the full structured event.
      return { ...selection, label: display.length <= 128 ? display : selection.label };
    }), group }));
}

export function goalResultMarket(period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition("result", period, "Match result", "1X2", (["home", "draw", "away"] as const)
    .map((result) => selected(result, resultLabels[result], { kind: "result", result })));
}
export function goalDoubleChanceMarket(period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition("double-chance", period, "Double chance", "DC", [
    selected("home-draw", "Home / Draw", { kind: "double-chance", results: ["home", "draw"] }),
    selected("draw-away", "Draw / Away", { kind: "double-chance", results: ["draw", "away"] }),
    selected("home-away", "Home / Away", { kind: "double-chance", results: ["home", "away"] }),
  ], "overlapping");
}
export function goalTotalsMarket(line: number, metric: "total" | "home" | "away" = "total",
  period: GoalMarketPeriod = "full-time", payout: "binary" | "asian" = "binary"): GoalMarketDefinition {
  const prefix = metric === "total" ? "Total goals" : `${resultLabels[metric]} team goals`;
  return definition(`totals:${metric}:${line}:${payout}`, period, `${prefix} ${line}`, `O/U ${line}`, (["over", "under"] as const)
    .map((direction) => selected(direction, `${direction === "over" ? "Over" : "Under"} ${line}`,
      { kind: payout === "asian" ? "asian-total" : "total", metric, direction, line })), payout === "asian" ? "payout" : "partition");
}
export const legacyLiveGoalMarketDefinitions: readonly GoalMarketDefinition[] = Object.freeze([goalTotalsMarket(1.5)]);

function goalCountMarket(metric: "total" | "home" | "away", period: GoalMarketPeriod, ranges: boolean): GoalMarketDefinition {
  const subject = metric === "total" ? "Total" : resultLabels[metric];
  const bands = ranges ? [[0, 1], [2, 3], [4, 5], [6, null]] as const
    : [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, null]] as const;
  return definition(`${ranges ? "count-range" : "exact-count"}:${metric}`, period, `${subject} goals ${ranges ? "range" : "exact count"}`,
    ranges ? "Range" : "Exact", bands.map(([min, max]) => {
      const label = max === null ? `${min}+` : min === max ? `${min}` : `${min}–${max}`;
      return selected(max === null ? `${min}+` : min === max ? `${min}` : `${min}-${max}`, label, { kind: "goal-count", metric, min, max });
    }));
}

function binaryMarket(kind: string, period: GoalMarketPeriod, label: string, code: string,
  rule: (yes: boolean) => GoalRule): GoalMarketDefinition {
  return definition(kind, period, label, code, [selected("yes", "Yes", rule(true)), selected("no", "No", rule(false))]);
}
export function goalBothTeamsScoreMarket(period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return binaryMarket("btts", period, "Both teams to score", "BTTS", (yes) => ({ kind: "both-teams-score", yes }));
}
export function goalParityMarket(metric: "total" | "home" | "away" = "total", period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition(`odd-even:${metric}`, period, `${metric === "total" ? "Total" : resultLabels[metric]} goals odd/even`, "Odd/Even", [
    selected("odd", "Odd", { kind: "odd-even", metric, odd: true }), selected("even", "Even", { kind: "odd-even", metric, odd: false }),
  ]);
}
export function goalCleanSheetMarket(team: "home" | "away", period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return binaryMarket(`clean-sheet:${team}`, period, `${resultLabels[team]} clean sheet`, "CS", (yes) => ({ kind: "clean-sheet", team, yes }));
}
export function goalWinToNilMarket(team: "home" | "away", period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return binaryMarket(`win-to-nil:${team}`, period, `${resultLabels[team]} win to nil`, "WTN", (yes) => ({ kind: "win-to-nil", team, yes }));
}
export function goalAsianHandicapMarket(homeLine: number, period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition(`asian-handicap:${homeLine}`, period, `Asian handicap ${homeLine}`, "AH", [
    selected("home", `Home ${homeLine}`, { kind: "asian-handicap", team: "home", line: homeLine }),
    selected("away", `Away ${-homeLine}`, { kind: "asian-handicap", team: "away", line: -homeLine }),
  ], "payout");
}
export function goalEuropeanHandicapMarket(homeLine: number, period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition(`european-handicap:${homeLine}`, period, `European handicap ${homeLine}`, "EH", (["home", "draw", "away"] as const)
    .map((result) => selected(result, resultLabels[result], { kind: "handicap-result", homeHandicap: homeLine, result })));
}
export function goalHalfFullMarket(): GoalMarketDefinition {
  return definition("half-full-result", "full-time", "Half time / full time", "HT/FT", (["home", "draw", "away"] as const)
    .flatMap((half) => (["home", "draw", "away"] as const).map((full) =>
      selected(`${half}-${full}`, `${resultLabels[half]} / ${resultLabels[full]}`, { kind: "half-full-result", half, full }))));
}
/** Provider-offered score selections; an Other group exists only when the caller explicitly maps that provider selection. */
export function goalExactScoreMarket(scores: readonly Readonly<{ home: number; away: number }>[],
  period: GoalMarketPeriod = "full-time", includeOther = false): GoalMarketDefinition {
  const selections = scores.map(({ home, away }) => selected(`${home}-${away}`, `${home}:${away}`, { kind: "exact-score", home, away }));
  if (includeOther) selections.push(selected("other", "Other score", { kind: "none", rules: selections.map((item) =>
    item.rule as Extract<GoalRule, { kind: "exact-score" }>) }));
  return definition("exact-score", period, "Exact score", "CSCORE", selections);
}
/** Explicit source-mapped binary combinations; the caller names every complementary selection. */
export function goalCombinationMarket(key: string, label: string, selections: readonly Selection[],
  period: GoalMarketPeriod = "full-time", group: "partition" | "overlapping" = "partition"): GoalMarketDefinition {
  return definition(`combination:${key}`, period, label, `${periods[period]} combo`, [...selections], group);
}

/** Publish the model-supported goal lines independently of the provider's odds inventory. */
export const liveGoalMarketDefinitions: readonly GoalMarketDefinition[] = Object.freeze([
  ...legacyLiveGoalMarketDefinitions,
  ...goalMarketPeriods.flatMap((period) => (["total", "home", "away"] as const).flatMap((metric) => [
    ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5].filter((line) => period !== "full-time" || metric !== "total" || line !== 1.5)
      .map((line) => goalTotalsMarket(line, metric, period)),
    ...Array.from({ length: 19 }, (_, index) => (index + 1) / 4).filter((line) => line % 1 !== 0.5)
      .map((line) => goalTotalsMarket(line, metric, period, "asian")),
    goalCountMarket(metric, period, false), goalCountMarket(metric, period, true), goalParityMarket(metric, period),
  ])),
]);
