import { publicPolicy } from "./public-policy.ts";

export const MARKET_RULE_VERSION = "regulation-markets-v1";
export const PROBABILITY_DISPLAY_VERSION = "probability-display-v1";
export type MarketFamily = typeof publicPolicy.markets[number];
export type MarketSource = "ai" | "api-football";
export type SourceGroup = Exclude<MarketFamily, "double-chance">;

export const marketSelections = Object.freeze({
  "match-result": Object.freeze(["home-win", "draw", "away-win"] as const),
  "double-chance": Object.freeze(["home-or-draw", "away-or-draw", "home-or-away"] as const),
  "total-goals": Object.freeze(["over-2.5", "under-2.5"] as const),
  "both-teams-to-score": Object.freeze(["yes", "no"] as const),
});

export type SelectionFor<Family extends MarketFamily> = typeof marketSelections[Family][number];
export type MarketSelection = SelectionFor<MarketFamily>;
export type ProbabilityDistribution<Family extends MarketFamily> = Family extends MarketFamily
  ? Readonly<Record<SelectionFor<Family>, number>> : never;

/** User-approved limits, probability units; comparisons include equality. */
export const marketRules = Object.freeze({
  ruleVersion: MARKET_RULE_VERSION,
  period: publicPolicy.matchPeriod,
  totalGoalsLine: publicPolicy.totalGoalsLine,
  probabilityMinimumExclusive: 0,
  probabilityMaximumExclusive: 1,
  probabilitySumTolerance: 0.001,
  consistencyTolerance: 0.002,
  sourceConflictRule: "preserve-valid-ai-groups-omit-conflicting-fallback",
} as const);

export type MarketFor<Family extends MarketFamily> = Family extends MarketFamily ? Readonly<{
  ruleVersion: typeof MARKET_RULE_VERSION;
  family: Family;
  period: typeof publicPolicy.matchPeriod;
  source: MarketSource;
  probabilities: ProbabilityDistribution<Family>;
  selection: SelectionFor<Family>;
  selectedProbability: number;
}> & (Family extends "total-goals" ? Readonly<{ line: 2.5 }> : object)
  & (Family extends "double-chance" ? Readonly<{ derivedFrom: "match-result" }> : object) : never;

export type AcceptedMarket = { [Family in MarketFamily]: MarketFor<Family> }[MarketFamily];
export type MarketRejectionReason =
  | "missing-group" | "unsupported-family" | "derived-only" | "invalid-candidate"
  | "invalid-source" | "unsupported-period" | "unsupported-line" | "incomplete-group"
  | "invalid-probability" | "invalid-sum" | "invalid-derived-probability" | "cross-market-conflict";
export type MarketAvailability =
  | Readonly<{ available: true; market: AcceptedMarket }>
  | Readonly<{ available: false; reason: MarketRejectionReason }>;
export type ConsistencyConstraint = "btts-under-requires-draw" | "draw-over-requires-btts";
export type MarketIssue = Readonly<{
  family: string;
  reason: MarketRejectionReason;
  relatedGroups?: readonly SourceGroup[];
  constraints?: readonly ConsistencyConstraint[];
}>;
export type MarketSnapshot = Readonly<{
  ruleVersion: typeof MARKET_RULE_VERSION;
  policy: typeof marketRules;
  markets: Readonly<Record<MarketFamily, MarketAvailability>>;
  issues: readonly MarketIssue[];
}>;
export type GroupValidation =
  | Readonly<{ valid: true; markets: readonly AcceptedMarket[] }>
  | Readonly<{ valid: false; reason: MarketRejectionReason }>;

export class MarketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketValidationError";
  }
}

const sourceGroups = Object.freeze(["match-result", "total-goals", "both-teams-to-score"] as const);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function isMarketFamily(value: unknown): value is MarketFamily {
  return typeof value === "string" && Object.hasOwn(marketSelections, value);
}

export function isMarketSelection(family: unknown, selection: unknown): selection is MarketSelection {
  return isMarketFamily(family) && typeof selection === "string" &&
    (marketSelections[family] as readonly string[]).includes(selection);
}

/** Exact decimal semantics of each number's canonical serialization, no epsilon. */
function decimalVector(values: readonly number[]) {
  const decimals = values.map((value) => {
    const [coefficient = "0", exponent = "0"] = String(value).split("e");
    const [whole = "0", fraction = ""] = coefficient.split(".");
    const scale = fraction.length - Number(exponent);
    return { units: BigInt(whole + fraction), scale };
  });
  const scale = Math.max(0, ...decimals.map((value) => value.scale));
  return {
    units: decimals.map((value) => value.units * 10n ** BigInt(scale - value.scale)),
    scale,
  };
}

function decimalSum(values: readonly number[]): number {
  const { units, scale } = decimalVector(values);
  const digits = units.reduce((total, value) => total + value, 0n).toString().padStart(scale + 1, "0");
  return Number(scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`);
}

function sumIsValid(values: readonly number[]): boolean {
  const { units, scale } = decimalVector([...values, marketRules.probabilitySumTolerance]);
  const tolerance = units.pop()!;
  const difference = units.reduce((total, value) => total + value, 0n) - 10n ** BigInt(scale);
  return (difference < 0n ? -difference : difference) <= tolerance;
}

function readDistribution(family: MarketFamily, input: unknown):
  | { valid: true; probabilities: Readonly<Record<string, number>> }
  | { valid: false; reason: MarketRejectionReason } {
  if (!isRecord(input) || Object.keys(input).length !== marketSelections[family].length ||
      marketSelections[family].some((selection) => !Object.hasOwn(input, selection))) {
    return { valid: false, reason: "incomplete-group" };
  }
  const probabilities: Record<string, number> = {};
  for (const selection of marketSelections[family]) {
    const probability = input[selection];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      return { valid: false, reason: "invalid-probability" };
    }
    probabilities[selection] = probability;
  }
  if (family !== "double-chance" && !sumIsValid(Object.values(probabilities))) {
    return { valid: false, reason: "invalid-sum" };
  }
  return { valid: true, probabilities: Object.freeze(probabilities) };
}

/** Select unrounded values, with exact ties in the specification's order. */
export function chooseMarketSelection<Family extends MarketFamily>(
  family: Family,
  distribution: ProbabilityDistribution<Family>,
): SelectionFor<Family> {
  if (!isMarketFamily(family)) throw new MarketValidationError("Market family is unsupported.");
  const checked = readDistribution(family, distribution);
  if (!checked.valid) throw new MarketValidationError("Selection requires a complete valid distribution.");
  let selected: MarketSelection = marketSelections[family][0];
  for (const selection of marketSelections[family]) {
    if (checked.probabilities[selection]! > checked.probabilities[selected]!) selected = selection;
  }
  return selected as SelectionFor<Family>;
}

function makeMarket<Family extends MarketFamily>(
  family: Family,
  probabilities: Readonly<Record<string, number>>,
  source: MarketSource,
): MarketFor<Family> {
  const distribution = probabilities as ProbabilityDistribution<Family>;
  const selection = chooseMarketSelection(family, distribution);
  return Object.freeze({
    ruleVersion: MARKET_RULE_VERSION,
    family,
    period: marketRules.period,
    source,
    probabilities: distribution,
    selection,
    selectedProbability: probabilities[selection]!,
    ...(family === "total-goals" ? { line: marketRules.totalGoalsLine } : {}),
    ...(family === "double-chance" ? { derivedFrom: "match-result" as const } : {}),
  }) as MarketFor<Family>;
}

/** No complement guessing, direct double-chance input, odds or source mixing. */
export function validateMarketGroup(family: unknown, candidate: unknown): GroupValidation {
  const reject = (reason: MarketRejectionReason): GroupValidation => Object.freeze({ valid: false, reason });
  if (!isMarketFamily(family)) return reject("unsupported-family");
  if (family === "double-chance") return reject("derived-only");
  if (candidate === undefined) return reject("missing-group");
  if (!isRecord(candidate) || Object.keys(candidate).some((key) =>
    !["source", "period", "probabilities", "line"].includes(key))) return reject("invalid-candidate");
  if (candidate.source !== "ai" && candidate.source !== "api-football") return reject("invalid-source");
  if (candidate.period !== marketRules.period) return reject("unsupported-period");
  if (family === "total-goals" ? candidate.line !== marketRules.totalGoalsLine : Object.hasOwn(candidate, "line")) {
    return reject("unsupported-line");
  }
  const checked = readDistribution(family, candidate.probabilities);
  if (!checked.valid) return reject(checked.reason);
  const markets: AcceptedMarket[] = [makeMarket(family, checked.probabilities, candidate.source)];
  if (family === "match-result") {
    const { "home-win": home, draw, "away-win": away } = checked.probabilities;
    const derived = readDistribution("double-chance", {
      "home-or-draw": decimalSum([home!, draw!]),
      "away-or-draw": decimalSum([away!, draw!]),
      "home-or-away": decimalSum([home!, away!]),
    });
    if (!derived.valid) return reject("invalid-derived-probability");
    markets.push(makeMarket("double-chance", derived.probabilities, candidate.source));
  }
  return Object.freeze({ valid: true, markets: Object.freeze(markets) });
}

/** The two feasible-marginal constraints; no joint score distribution is invented. */
export function checkMarketConsistency(
  matchResult: ProbabilityDistribution<"match-result">,
  totalGoals: ProbabilityDistribution<"total-goals">,
  btts: ProbabilityDistribution<"both-teams-to-score">,
): readonly ConsistencyConstraint[] {
  for (const [family, distribution] of [
    ["match-result", matchResult], ["total-goals", totalGoals], ["both-teams-to-score", btts],
  ] as const) {
    if (!readDistribution(family, distribution).valid) {
      throw new MarketValidationError("Consistency requires complete valid distributions.");
    }
  }
  const { units } = decimalVector([
    matchResult.draw, totalGoals["over-2.5"], btts.yes, marketRules.consistencyTolerance, 1,
  ]);
  const [draw, over, yes, tolerance, one] = units as [bigint, bigint, bigint, bigint, bigint];
  const failures: ConsistencyConstraint[] = [];
  if (yes > draw + over + tolerance) failures.push("btts-under-requires-draw");
  if (draw + over > one + yes + tolerance) failures.push("draw-over-requires-btts");
  return Object.freeze(failures);
}

/** Validate one candidate per source group; source fetching/resolution belongs to 013. */
export function validateMarketSnapshot(input: unknown): MarketSnapshot {
  const unavailable = (reason: MarketRejectionReason): MarketAvailability => Object.freeze({ available: false, reason });
  const markets: Record<MarketFamily, MarketAvailability> = {
    "match-result": unavailable("missing-group"),
    "double-chance": unavailable("missing-group"),
    "total-goals": unavailable("missing-group"),
    "both-teams-to-score": unavailable("missing-group"),
  };
  const issues: MarketIssue[] = [];
  const candidates = isRecord(input) ? input : {};
  if (!isRecord(input)) issues.push(Object.freeze({ family: "snapshot", reason: "invalid-candidate" }));
  for (const family of Object.keys(candidates).sort()) {
    if (!(sourceGroups as readonly string[]).includes(family)) {
      issues.push(Object.freeze({ family, reason: family === "double-chance" ? "derived-only" : "unsupported-family" }));
    }
  }
  for (const family of sourceGroups) {
    const checked = validateMarketGroup(family, Object.hasOwn(candidates, family) ? candidates[family] : undefined);
    if (checked.valid) {
      for (const market of checked.markets) markets[market.family] = Object.freeze({ available: true, market });
    } else {
      markets[family] = unavailable(checked.reason);
      if (family === "match-result") markets["double-chance"] = unavailable(checked.reason);
      issues.push(Object.freeze({ family, reason: checked.reason }));
    }
  }
  const result = markets["match-result"];
  const totals = markets["total-goals"];
  const btts = markets["both-teams-to-score"];
  if (result.available && result.market.family === "match-result" &&
      totals.available && totals.market.family === "total-goals" &&
      btts.available && btts.market.family === "both-teams-to-score") {
    const constraints = checkMarketConsistency(result.market.probabilities, totals.market.probabilities, btts.market.probabilities);
    if (constraints.length > 0) {
      const participants = [result.market, totals.market, btts.market];
      const fallback = participants.filter((market) => market.source === "api-football");
      // Keep valid AI ahead of conflicting fallback. With one source, all joint
      // participants are invalid; do not invent an arbitrary family preference.
      for (const market of fallback.length > 0 ? fallback : participants) {
        markets[market.family] = unavailable("cross-market-conflict");
        if (market.family === "match-result") markets["double-chance"] = unavailable("cross-market-conflict");
        issues.push(Object.freeze({
          family: market.family,
          reason: "cross-market-conflict",
          relatedGroups: sourceGroups,
          constraints,
        }));
      }
    }
  }
  return Object.freeze({
    ruleVersion: MARKET_RULE_VERSION,
    policy: marketRules,
    markets: Object.freeze(markets),
    issues: Object.freeze(issues),
  });
}

export type ProbabilityLabelKey = "probability.percent" | "probability.less-than-one" | "probability.more-than-ninety-nine";
export type ProbabilityPresentation = Readonly<{
  ruleVersion: typeof MARKET_RULE_VERSION;
  displayVersion: typeof PROBABILITY_DISPLAY_VERSION;
  labelKey: "probability.estimated";
  selection: MarketSelection;
  entries: readonly Readonly<{
    selection: MarketSelection;
    probability: number;
    roundedPercent: number;
    labelKey: ProbabilityLabelKey;
  }>[];
}>;

/** Largest remainders allocate exclusive display groups to 100; stored values stay intact. */
export function presentMarketProbabilities(market: AcceptedMarket): ProbabilityPresentation {
  if (!isRecord(market) || !isMarketFamily(market.family) || market.ruleVersion !== MARKET_RULE_VERSION) {
    throw new MarketValidationError("Presentation requires a supported versioned market.");
  }
  const checked = readDistribution(market.family, market.probabilities);
  if (!checked.valid) throw new MarketValidationError("Presentation requires complete valid probabilities.");
  if (market.period !== marketRules.period || (market.source !== "ai" && market.source !== "api-football") ||
      market.selection !== chooseMarketSelection(market.family, market.probabilities) ||
      market.selectedProbability !== checked.probabilities[market.selection] ||
      (market.family === "total-goals" ? market.line !== marketRules.totalGoalsLine : Object.hasOwn(market, "line")) ||
      (market.family === "double-chance" ? market.derivedFrom !== "match-result" : Object.hasOwn(market, "derivedFrom"))) {
    throw new MarketValidationError("Presentation requires consistent accepted market metadata.");
  }
  const selections = marketSelections[market.family];
  const probabilities = selections.map((selection) => checked.probabilities[selection]!);
  const { units, scale } = decimalVector(probabilities);
  const divisor = market.family === "double-chance"
    ? 10n ** BigInt(scale)
    : units.reduce((total, value) => total + value, 0n);
  const percentages = units.map((value) => Number(value * 100n / divisor));
  if (market.family === "double-chance") {
    units.forEach((value, index) => {
      if (value * 100n % divisor * 2n >= divisor) percentages[index]! += 1;
    });
  } else {
    const order = units.map((value, index) => ({ index, remainder: value * 100n % divisor }))
      .sort((left, right) => left.remainder === right.remainder ? left.index - right.index
        : left.remainder > right.remainder ? -1 : 1);
    const remaining = 100 - percentages.reduce((total, value) => total + value, 0);
    for (let index = 0; index < remaining; index += 1) percentages[order[index]!.index]! += 1;
  }
  const entries = selections.map((selection, index) => {
    const roundedPercent = percentages[index]!;
    const labelKey: ProbabilityLabelKey = roundedPercent === 0 ? "probability.less-than-one"
      : roundedPercent === 100 ? "probability.more-than-ninety-nine" : "probability.percent";
    return Object.freeze({ selection, probability: probabilities[index]!, roundedPercent, labelKey });
  });
  return Object.freeze({
    ruleVersion: MARKET_RULE_VERSION,
    displayVersion: PROBABILITY_DISPLAY_VERSION,
    labelKey: "probability.estimated",
    selection: market.selection,
    entries: Object.freeze(entries),
  });
}
