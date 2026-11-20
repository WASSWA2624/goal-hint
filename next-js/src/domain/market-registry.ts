import { marketSelections, type MarketFamily } from "./markets.ts";
import { IMPLIED_MARKET_MAPPING_VERSION } from "./market-implied-markets.ts";
import { NON_GOAL_MARKET_RULE_VERSION, countMetrics, eventMetrics, type NonGoalRule } from "./non-goal-market-definitions.ts";
import { LIVE_ODDS_MAPPING_VERSION, ODDS_MAPPING_VERSION, binaryGoalTotalOddsMapping, launchLiveOddsMapping, launchOddsMapping } from "./odds-markets.ts";
import { GOAL_MARKET_RULE_VERSION, goalMarketPeriods, type GoalMarketPeriod, type GoalRule } from "./score-distribution-markets.ts";

export const MARKET_REGISTRY_VERSION = "football-market-registry-v1";

type SelectionSet =
  | Readonly<{ kind: "fixed"; keys: readonly string[] }>
  | Readonly<{ kind: "counts" | "scores" | "ranges" | "combinations"; coverage: "exhaustive-partition-or-explicit-overlap" }>;

type Parameters = Readonly<{
  line: "none" | "zero" | "half-or-asian-quarter" | "signed-quarter" | "signed-integer";
  team: "none" | "side" | "match-or-side";
  player: "none" | "required";
  metric?: readonly string[];
  eventOrder?: readonly ("any" | "first" | "last")[];
}>;

type Settlement =
  | Readonly<{ basis: "score"; version: typeof GOAL_MARKET_RULE_VERSION; rules: readonly GoalRule["kind"][];
    evidence: "verified-regulation-score-and-required-half-time-score" }>
  | Readonly<{ basis: "count" | "event"; version: typeof NON_GOAL_MARKET_RULE_VERSION; rules: readonly NonGoalRule["kind"][];
    evidence: "verified-period-counts" | "complete-verified-period-events" }>
  | Readonly<{ basis: "unsupported"; reason: string }>;

type Model =
  | Readonly<{ basis: "score-distribution"; evidence: "point-in-time-regulation-score-evidence"; supportsLocalPoissonCounts: boolean }>
  | Readonly<{ basis: "unsupported"; evidence: "point-in-time-player-participation-and-events" | "point-in-time-period-counts" |
    "point-in-time-period-events" | "verified-first-and-second-half-scores"; reason: string }>;

export type MarketRegistryEntry = Readonly<{
  name: string;
  periods: readonly GoalMarketPeriod[];
  selections: SelectionSet;
  parameters: Parameters;
  settlement: Settlement;
  grading: "partition" | "overlapping" | "separate-push-and-partial-grades" | "depends-on-definition";
  models: Model;
  legacyFamily: MarketFamily | null;
  providerForecast: "reported-1x2-full-time" | "derived-from-reported-1x2-full-time" | "unsupported";
  bookmakerEvidence: "catalog-and-fixture-offer" | "reviewed-count-or-event-mapping" | "unmapped";
}>;

const allPeriods = Object.freeze(goalMarketPeriods);
const fullTime = Object.freeze(["full-time"] as const);
const noParameters = Object.freeze({ line: "none", team: "none", player: "none" } as const);
const result = Object.freeze(["home", "draw", "away"] as const);
const sides = Object.freeze(["home", "away"] as const);
const yesNo = Object.freeze(["yes", "no"] as const);
const overUnder = Object.freeze(["over", "under"] as const);
const doubleChance = Object.freeze(["home-draw", "draw-away", "home-away"] as const);
const fixed = (keys: readonly string[]): SelectionSet => Object.freeze({ kind: "fixed", keys: Object.freeze(keys) });
const variable = (kind: "counts" | "scores" | "ranges" | "combinations"): SelectionSet =>
  Object.freeze({ kind, coverage: "exhaustive-partition-or-explicit-overlap" });

const scoreModel: Model = Object.freeze({
  basis: "score-distribution", evidence: "point-in-time-regulation-score-evidence", supportsLocalPoissonCounts: false,
});
const countModel: Model = Object.freeze({ ...scoreModel, supportsLocalPoissonCounts: true });
const unsupportedModel = (evidence: Extract<Model, { basis: "unsupported" }>["evidence"], reason: string): Model =>
  Object.freeze({ basis: "unsupported", evidence, reason });
const noPlayerModel = unsupportedModel("point-in-time-player-participation-and-events", "no-qualified-player-model");
const noStatisticModel = unsupportedModel("point-in-time-period-counts", "no-qualified-statistic-model");

type ScoreEntry = Pick<MarketRegistryEntry, "name" | "selections"> & Partial<Omit<MarketRegistryEntry, "name" | "selections" | "settlement">>;
function scoreMarket(entry: ScoreEntry, ...rules: GoalRule["kind"][]): MarketRegistryEntry {
  return Object.freeze({ periods: allPeriods, parameters: noParameters, grading: "partition", models: scoreModel,
    legacyFamily: null, providerForecast: "unsupported", bookmakerEvidence: "unmapped", ...entry,
    settlement: Object.freeze({ basis: "score", version: GOAL_MARKET_RULE_VERSION, rules: Object.freeze(rules),
      evidence: "verified-regulation-score-and-required-half-time-score" }),
  });
}

function reviewedStatisticMarket(entry: Pick<MarketRegistryEntry, "name" | "selections" | "parameters" | "grading" | "models">,
  basis: "count" | "event", ...rules: NonGoalRule["kind"][]): MarketRegistryEntry {
  return Object.freeze({ ...entry, periods: allPeriods, legacyFamily: null, providerForecast: "unsupported",
    bookmakerEvidence: "reviewed-count-or-event-mapping",
    settlement: Object.freeze({ basis, version: NON_GOAL_MARKET_RULE_VERSION, rules: Object.freeze(rules),
      evidence: basis === "count" ? "verified-period-counts" : "complete-verified-period-events" }),
  });
}

function unsupportedMarket(entry: Pick<MarketRegistryEntry, "name" | "periods" | "selections" | "parameters" | "grading" | "models">,
  reason: string): MarketRegistryEntry {
  return Object.freeze({ ...entry, legacyFamily: null, providerForecast: "unsupported", bookmakerEvidence: "unmapped",
    settlement: Object.freeze({ basis: "unsupported", reason }),
  });
}

const teamCount = Object.freeze({ ...noParameters, team: "side" } as const);
const totals = Object.freeze({ ...noParameters, line: "half-or-asian-quarter" } as const);
const player = Object.freeze({ ...noParameters, player: "required" } as const);
const eventOrder = Object.freeze(["any", "first", "last"] as const);

/** Family definitions describe semantics, never which lines, prices or players a particular fixture offers.
 * The referenced goal and non-goal rule schemas still validate concrete parameterized selections.
 * For half-based selections, the score evaluator requires verified first-half data in addition to regulation scores.
 */
export const marketRegistry = Object.freeze({
  "match-result": scoreMarket({ name: "Match result", selections: fixed(result), legacyFamily: "match-result",
    providerForecast: "reported-1x2-full-time", bookmakerEvidence: "catalog-and-fixture-offer" }, "result"),
  "double-chance": scoreMarket({ name: "Double chance", selections: fixed(doubleChance), legacyFamily: "double-chance",
    providerForecast: "derived-from-reported-1x2-full-time", bookmakerEvidence: "catalog-and-fixture-offer",
    grading: "overlapping" }, "double-chance"),
  "draw-no-bet": scoreMarket({ name: "Draw no bet", selections: fixed(sides), parameters: Object.freeze({ ...noParameters, line: "zero" }),
    grading: "separate-push-and-partial-grades" }, "asian-handicap"),
  "asian-handicap": scoreMarket({ name: "Asian handicap", selections: fixed(sides),
    parameters: Object.freeze({ ...noParameters, line: "signed-quarter" }), grading: "separate-push-and-partial-grades" }, "asian-handicap"),
  "european-handicap": scoreMarket({ name: "European handicap", selections: fixed(result),
    parameters: Object.freeze({ ...noParameters, line: "signed-integer" }) }, "handicap-result"),
  "total-goals": scoreMarket({ name: "Total goals", selections: fixed(overUnder), parameters: totals, models: countModel,
    grading: "depends-on-definition", legacyFamily: "total-goals", bookmakerEvidence: "catalog-and-fixture-offer" }, "total", "asian-total"),
  "team-goals": scoreMarket({ name: "Team goals", selections: fixed(overUnder), models: countModel,
    parameters: Object.freeze({ ...totals, team: "side" }), grading: "depends-on-definition" }, "total", "asian-total"),
  "team-to-score": scoreMarket({ name: "Team to score", selections: fixed(yesNo), parameters: teamCount,
    models: countModel }, "goal-count"),
  "clean-sheet": scoreMarket({ name: "Clean sheet", selections: fixed(yesNo), parameters: teamCount }, "clean-sheet"),
  "win-to-nil": scoreMarket({ name: "Win to nil", selections: fixed(yesNo), parameters: teamCount }, "win-to-nil"),
  "both-teams-to-score": scoreMarket({ name: "Both teams to score", selections: fixed(yesNo), legacyFamily: "both-teams-to-score",
    bookmakerEvidence: "catalog-and-fixture-offer" }, "both-teams-score"),
  "correct-score": scoreMarket({ name: "Correct score", selections: variable("scores") }, "exact-score", "none"),
  "exact-goals": scoreMarket({ name: "Exact number of goals", selections: variable("counts"), models: countModel,
    parameters: Object.freeze({ ...noParameters, team: "match-or-side" }) }, "goal-count"),
  "goal-ranges": scoreMarket({ name: "Goal ranges", selections: variable("ranges"), models: countModel,
    parameters: Object.freeze({ ...noParameters, team: "match-or-side" }), grading: "depends-on-definition" }, "goal-count"),
  "odd-even-goals": scoreMarket({ name: "Odd or even goals", selections: fixed(["odd", "even"]), models: countModel,
    parameters: Object.freeze({ ...noParameters, team: "match-or-side" }) }, "odd-even"),
  "half-time-full-time": scoreMarket({ name: "Half-time / full-time", periods: fullTime,
    selections: fixed(result.flatMap((half) => result.map((full) => `${half}-${full}`))) }, "half-full-result"),
  "highest-scoring-half": unsupportedMarket({ name: "Highest-scoring half", periods: fullTime,
    selections: fixed(["first-half", "equal", "second-half"]), parameters: noParameters, grading: "partition",
    models: unsupportedModel("verified-first-and-second-half-scores", "no-shared-half-comparison-rule") },
  "no-shared-half-comparison-rule"),
  "scoring-in-both-halves": unsupportedMarket({ name: "Scoring in both halves", periods: fullTime, selections: fixed(yesNo),
    parameters: Object.freeze({ ...noParameters, team: "match-or-side" }), grading: "partition",
    models: unsupportedModel("verified-first-and-second-half-scores", "no-cross-period-combination-rule") },
  "no-cross-period-combination-rule"),
  "combined-outcomes": scoreMarket({ name: "Combined outcomes", selections: variable("combinations"),
    grading: "depends-on-definition" }, "all", "none"),
  "player-scorer": reviewedStatisticMarket({ name: "Player to score anytime, first or last", selections: fixed(yesNo),
    parameters: Object.freeze({ ...player, metric: Object.freeze(["goals"]), eventOrder }), grading: "partition", models: noPlayerModel }, "event", "event-occurs"),
  "player-event": reviewedStatisticMarket({ name: "Player event", selections: fixed(yesNo),
    parameters: Object.freeze({ ...player, metric: Object.freeze(eventMetrics.filter((metric) => metric !== "goals")), eventOrder }),
    grading: "partition", models: noPlayerModel }, "event", "event-occurs"),
  "player-totals": unsupportedMarket({ name: "Player totals", periods: allPeriods, selections: fixed(overUnder),
    parameters: Object.freeze({ ...player, line: "half-or-asian-quarter", metric: Object.freeze(["goals", "assists", "total-shots", "cards"]) }),
    grading: "depends-on-definition", models: noPlayerModel }, "no-verified-player-count-settlement"),
  "statistic-totals": reviewedStatisticMarket({ name: "Team or match statistic totals", selections: fixed(overUnder),
    parameters: Object.freeze({ ...totals, team: "match-or-side", metric: Object.freeze(countMetrics) }),
    grading: "depends-on-definition", models: noStatisticModel }, "count", "total", "asian-total"),
  "statistic-result": reviewedStatisticMarket({ name: "Team statistic result", selections: fixed(result),
    parameters: Object.freeze({ ...noParameters, metric: countMetrics }), grading: "partition", models: noStatisticModel }, "count", "result"),
  "statistic-double-chance": reviewedStatisticMarket({ name: "Team statistic double chance", selections: fixed(doubleChance),
    parameters: Object.freeze({ ...noParameters, metric: countMetrics }), grading: "overlapping", models: noStatisticModel }, "count", "double-chance"),
  "statistic-odd-even": reviewedStatisticMarket({ name: "Odd or even statistic count", selections: fixed(["odd", "even"]),
    parameters: Object.freeze({ ...noParameters, team: "match-or-side", metric: countMetrics }),
    grading: "partition", models: noStatisticModel }, "count", "odd-even"),
  "statistic-exact": reviewedStatisticMarket({ name: "Exact statistic count", selections: variable("counts"),
    parameters: Object.freeze({ ...noParameters, team: "match-or-side", metric: countMetrics }),
    grading: "partition", models: noStatisticModel }, "count", "exact-count", "other-count"),
  "statistic-european-handicap": reviewedStatisticMarket({ name: "European statistic handicap", selections: fixed(result),
    parameters: Object.freeze({ ...noParameters, line: "signed-integer", metric: countMetrics }),
    grading: "partition", models: noStatisticModel }, "count", "handicap-result"),
  "statistic-asian-handicap": reviewedStatisticMarket({ name: "Asian statistic handicap", selections: fixed(sides),
    parameters: Object.freeze({ ...noParameters, line: "signed-quarter", metric: countMetrics }),
    grading: "separate-push-and-partial-grades", models: noStatisticModel }, "count", "asian-handicap"),
  "first-or-last-team-event": reviewedStatisticMarket({ name: "First or last team event", selections: fixed(["home", "away", "none"]),
    parameters: Object.freeze({ ...noParameters, metric: eventMetrics, eventOrder: Object.freeze(["first", "last"] as const) }),
    grading: "partition", models: unsupportedModel("point-in-time-period-events", "no-qualified-event-order-model") },
  "event", "event-team"),
});

export type RegisteredMarketFamily = keyof typeof marketRegistry;
export const marketProviderMappings = Object.freeze({
  legacySelections: marketSelections,
  forecast: Object.freeze({ period: "full-time", endpoint: "/predictions", group: "predictions.percent",
    keys: Object.freeze({ home: "home-win", draw: "draw", away: "away-win" }) }),
  "pre-match": Object.freeze({ endpoint: "/odds/bets", version: ODDS_MAPPING_VERSION, launchPeriod: "full-time", launch: launchOddsMapping,
    binaryMatchTotals: binaryGoalTotalOddsMapping, reviewedCountOrEvent: IMPLIED_MARKET_MAPPING_VERSION }),
  "live": Object.freeze({ endpoint: "/odds/live/bets", version: LIVE_ODDS_MAPPING_VERSION, launchPeriod: "full-time", launch: launchLiveOddsMapping }),
});
