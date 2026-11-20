import { freezeDefinition, goalMarketDefinitionSchema, goalMarketPeriods, type GoalMarketDefinition, type GoalMarketPeriod, type GoalRule } from "./score-distribution-markets.ts";
import { predictionRuleLabel } from "./prediction-label.ts";
import type { RegisteredMarketFamily } from "./market-registry.ts";

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
function goalAsianHandicapSelections(homeLine: number): Selection[] {
  return [
    selected("home", `Home ${homeLine}`, { kind: "asian-handicap", team: "home", line: homeLine }),
    selected("away", `Away ${-homeLine}`, { kind: "asian-handicap", team: "away", line: -homeLine }),
  ];
}
export function goalDrawNoBetMarket(period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition("draw-no-bet", period, "Draw no bet", "DNB", goalAsianHandicapSelections(0), "payout");
}
export function goalAsianHandicapMarket(homeLine: number, period: GoalMarketPeriod = "full-time"): GoalMarketDefinition {
  return definition(`asian-handicap:${homeLine}`, period, `Asian handicap ${homeLine}`, "AH", goalAsianHandicapSelections(homeLine), "payout");
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
export function goalHighestScoringHalfMarket(): GoalMarketDefinition {
  return definition("highest-scoring-half", "full-time", "Highest-scoring half", "HSH", (["first-half", "equal", "second-half"] as const)
    .map((half) => selected(half, half, { kind: "highest-scoring-half", half })));
}
export function goalScoringInBothHalvesMarket(metric: "total" | "home" | "away"): GoalMarketDefinition {
  const label = metric === "total" ? "At least one goal in each half" : `${resultLabels[metric]} team to score in both halves`;
  return binaryMarket(`scoring-in-both-halves:${metric}`, "full-time", label, "Both halves", (yes) =>
    ({ kind: "scoring-in-both-halves", metric, yes }));
}
/** Provider-offered score selections; an Other group exists only when the caller explicitly maps that provider selection. */
export function goalExactScoreMarket(scores: readonly Readonly<{ home: number; away: number }>[],
  period: GoalMarketPeriod = "full-time", includeOther = false): GoalMarketDefinition {
  const selections = scores.map(({ home, away }) => selected(`${home}-${away}`, `${home}:${away}`, { kind: "exact-score", home, away }));
  if (includeOther) selections.push(selected("other", "Other score", { kind: "none", rules: selections.map((item) =>
    item.rule as Extract<GoalRule, { kind: "exact-score" }>) }));
  return definition("exact-score", period, "Exact score", "CSCORE", selections);
}
/** Reviewed binary combinations; the caller names every complementary selection. */
export function goalCombinationMarket(key: string, label: string, selections: readonly Selection[],
  period: GoalMarketPeriod = "full-time", group: "partition" | "overlapping" = "partition"): GoalMarketDefinition {
  return definition(`combination:${key}`, period, label, `${periods[period]} combo`, [...selections], group);
}

export type RegisteredGoalMarketDefinition = Readonly<{ family: RegisteredMarketFamily; definition: GoalMarketDefinition }>;
const registered = (family: RegisteredMarketFamily, definition: GoalMarketDefinition): RegisteredGoalMarketDefinition => Object.freeze({ family, definition });
const metrics = ["total", "home", "away"] as const;
const sides = ["home", "away"] as const;
const binaryTotalLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5] as const;
const asianTotalLines = Array.from({ length: 19 }, (_, index) => (index + 1) / 4).filter((line) => line % 1 !== 0.5);
const registeredCountMarkets = [
  registered("total-goals", legacyLiveGoalMarketDefinitions[0]!),
  ...goalMarketPeriods.flatMap((period) => metrics.flatMap((metric) => {
    const family = metric === "total" ? "total-goals" : "team-goals";
    return [
      ...binaryTotalLines.filter((line) => period !== "full-time" || metric !== "total" || line !== 1.5)
        .map((line) => registered(family, goalTotalsMarket(line, metric, period))),
      ...asianTotalLines.map((line) => registered(family, goalTotalsMarket(line, metric, period, "asian"))),
      registered("exact-goals", goalCountMarket(metric, period, false)),
      registered("goal-ranges", goalCountMarket(metric, period, true)),
      registered("odd-even-goals", goalParityMarket(metric, period)),
    ];
  })),
];

/** Preserve the current public goal extension's definitions and their order. */
export const liveGoalMarketDefinitions: readonly GoalMarketDefinition[] = Object.freeze(registeredCountMarkets.map((row) => row.definition));

export const LOCAL_FIRST_GOAL_EVALUATION_PROFILE = "local-regulation-count-v1";
const additionalFullTimeTotals = [5, 5.25].map((line) => registered("total-goals", goalTotalsMarket(line, "total", "full-time", "asian")));

/** The new full-match totals range changes forecast admission only. */
export function isEligibleLocalFirstGoalDefinition({ period, selections }: GoalMarketDefinition) {
  return period !== "full-time" || selections.every(({ rule }) =>
    (rule.kind !== "total" && rule.kind !== "asian-total") || rule.metric !== "total" || rule.line >= 1.5 && rule.line <= 5.5);
}

function goalTeamToScoreMarket(team: "home" | "away", period: GoalMarketPeriod): GoalMarketDefinition {
  return binaryMarket(`team-to-score:${team}`, period, `${resultLabels[team]} team to score`, "TTS", (yes) =>
    ({ kind: "goal-count", metric: team, min: yes ? 1 : 0, max: yes ? null : 0 }));
}

function goalRangeSelectionMarket(max: number, period: GoalMarketPeriod, key = "goal-range"): GoalMarketDefinition {
  const range = { kind: "goal-count", metric: "total", min: 1, max } as const;
  return binaryMarket(`${key}:total:1-${max}`, period, `Total goals 1–${max}`, "Range", (yes) =>
    yes ? range : { kind: "none", rules: [range] });
}

function goalAndTotalsMarket(component: GoalMarketDefinition, label: string): GoalMarketDefinition {
  const totals = goalTotalsMarket(2.5), combinations = component.selections.flatMap((left) => totals.selections.map((right) =>
    selected(`${left.key}-${right.key}`, `${left.label} and ${right.label}`, {
      kind: "all", rules: [left.rule, right.rule] as Extract<GoalRule, { kind: "all" }>["rules"],
    })));
  return goalCombinationMarket(`${component.key.split(":")[2]}:total:2.5`, label, combinations, "full-time",
    component.group === "overlapping" ? "overlapping" : "partition");
}

// Fixed ordinary handicap and score selections, independent of bookmaker coverage.
const asianHandicapLines = [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1] as const;
const europeanHandicapLines = [-1, 1] as const;
const exactScoreValues = [0, 1, 2, 3, 4] as const;
const exactScores = exactScoreValues.flatMap((home) => exactScoreValues.map((away) => ({ home, away })));

const forecastGoalMarkets = Object.freeze([
    ...registeredCountMarkets,
    ...goalMarketPeriods.flatMap((period) => [
      registered("match-result", goalResultMarket(period)), registered("double-chance", goalDoubleChanceMarket(period)),
      registered("draw-no-bet", goalDrawNoBetMarket(period)),
      ...asianHandicapLines.map((line) => registered("asian-handicap", goalAsianHandicapMarket(line, period))),
      ...europeanHandicapLines.map((line) => registered("european-handicap", goalEuropeanHandicapMarket(line, period))),
      registered("both-teams-to-score", goalBothTeamsScoreMarket(period)), registered("correct-score", goalExactScoreMarket(exactScores, period, true)),
      ...sides.flatMap((team) => [registered("team-to-score", goalTeamToScoreMarket(team, period)), registered("clean-sheet", goalCleanSheetMarket(team, period)),
        registered("win-to-nil", goalWinToNilMarket(team, period))]),
      ...[2, 3, 4].map((max) => registered("goal-ranges", goalRangeSelectionMarket(max, period))),
    ]),
    registered("half-time-full-time", goalHalfFullMarket()), registered("highest-scoring-half", goalHighestScoringHalfMarket()),
    ...metrics.map((metric) => registered("scoring-in-both-halves", goalScoringInBothHalvesMarket(metric))),
    registered("combined-outcomes", goalAndTotalsMarket(goalResultMarket(), "Result and total goals 2.5")),
    registered("combined-outcomes", goalAndTotalsMarket(goalDoubleChanceMarket(), "Double chance and total goals 2.5")),
    registered("combined-outcomes", goalAndTotalsMarket(goalBothTeamsScoreMarket(), "Both teams to score and total goals 2.5")),
]);
const namedRegulationCountRanges = [2, 3, 4].map((max) => registered("goal-ranges", goalRangeSelectionMarket(max, "full-time", "count-range")));
const localFirstForecastGoalMarkets = Object.freeze([...forecastGoalMarkets, ...additionalFullTimeTotals, ...namedRegulationCountRanges]);

/** Regulation-count events with a verified public pick and settlement identity. */
const localCountFamilies = new Set<RegisteredMarketFamily>([
  "total-goals", "team-goals", "goal-ranges", "exact-goals", "odd-even-goals",
]);
export const localFirstGoalMarketDefinitions: readonly GoalMarketDefinition[] = Object.freeze(localFirstForecastGoalMarkets.flatMap(({ family, definition }) =>
  definition.period === "full-time" && localCountFamilies.has(family) && isEligibleLocalFirstGoalDefinition(definition) &&
    !definition.key.startsWith("goal:full-time:goal-range:") ? [definition] : []));

/** Reviewed modeled instances of the shared registry. Model qualification and
 * observed offers still determine the available output for each fixture. */
export function registeredForecastGoalMarkets(localFirst = false): readonly RegisteredGoalMarketDefinition[] {
  return localFirst ? localFirstForecastGoalMarkets : forecastGoalMarkets;
}
