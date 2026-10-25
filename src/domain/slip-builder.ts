import { addReportingDays, calendarRules, parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange } from "./calendar.ts";
import { formatProbabilityValue, parseProbabilityValue, probabilityFraction, type FeedParameters } from "./feed-query.ts";
import { kickoffTimeWindows, validKickoffTime } from "./kickoff-time.ts";
import type { StoredMatchFeedRecord } from "./match-feed.ts";
import { isMarketFamily, isMarketSelection, marketSelections, type MarketFamily, type MarketSelection } from "./markets.ts";
import { formatOddsHundredths, oddsRules, parseDecimalOdds } from "./odds.ts";
import { publicPolicy } from "./public-policy.ts";
import type { SlipForecastReference } from "./slip-forecast-reference.ts";
export type { SlipForecastReference } from "./slip-forecast-reference.ts";

/** Limits apply equally to native GET forms, browser validation and the bounded server search. */
export const slipBuilderRules = Object.freeze({
  maximumDays: 31, maximumSelections: 8, maximumSlips: 10,
  minimumOddsHundredths: oddsRules.minimumHundredths, maximumOddsHundredths: oddsRules.maximumHundredths,
  maximumTotalOddsHundredths: 10_000_000,
  maximumCandidates: 60, maximumSearchNodes: 100_000, maximumCombinations: 2_000, maximumBatchNodes: 100_000,
});

export type SlipCriteria = Readonly<{
  dateFrom: string; dateTo: string;
  /** Inclusive daily kickoff minutes in the source-owned Africa/Kampala reporting zone; blank means all day. */
  timeFrom: string; timeTo: string;
  markets: readonly MarketFamily[];
  /** Missing family means Automatic; explicit choices use their own published probabilities and prices. */
  outcomes?: Readonly<Partial<Record<MarketFamily, readonly MarketSelection[]>>>;
  /** Inclusive decimal odds bounds, represented in hundredths. */
  totalMin: number; totalMax: number; oddsMin: number; oddsMax: number;
  probMin: number; probMax: number; teamsMin: number; teamsMax: number; slips: number; reuse: boolean;
}>;
export const slipInputFields = ["dateFrom", "dateTo", "timeFrom", "timeTo", "totalMin", "totalMax", "oddsMin", "oddsMax",
  "probMin", "probMax", "teamsMin", "teamsMax", "slips"] as const;
export type SlipInputs = Partial<Record<typeof slipInputFields[number], string>>;
/** Slip-only approved outcome prices leave the ordinary selected-pick feed contract intact. */
export type SlipMatchRecord = StoredMatchFeedRecord & Readonly<{ selectionPrices?: readonly StoredMatchFeedRecord["prices"][number][] }>;
export type SlipSelection = Readonly<{
  fixtureId: string; kickoffAt: number;
  homeTeam: StoredMatchFeedRecord["homeTeam"]; awayTeam: StoredMatchFeedRecord["awayTeam"]; competition: StoredMatchFeedRecord["competition"];
  family: MarketFamily; selection: MarketSelection; probability: number; odds: string; oddsBasis: "bookmaker" | "median";
  forecast?: SlipForecastReference;
}>;
export type BuiltSlip = Readonly<{
  id: string; selections: readonly SlipSelection[]; totalOdds: string; oddsBasis: "bookmaker" | "median";
  /** Arithmetic mean of the selected forecasts, never a joint chance of winning the accumulator. */
  averageProbability: number;
}>;
export type SlipBuildResult = Readonly<{
  slips: readonly BuiltSlip[]; qualifyingMatches: number; excludedMissingOdds: number; excludedMissingForecast: number;
  /** A candidate, enumeration, retained-combination or compatible-batch budget was reached. */
  searchLimited: boolean;
}>;
export type SlipRanking = Readonly<{
  accepts: (slip: BuiltSlip) => boolean;
  compare: (left: BuiltSlip, right: BuiltSlip) => number;
}>;
export type SlipCriteriaErrorCode = "invalid-query" | "invalid-date-range" | "invalid-time-range" | "invalid-market" | "invalid-pick"
  | "invalid-odds-range" | "invalid-probability-range" | "invalid-selection-range" | "invalid-slip-count";
export class SlipCriteriaError extends RangeError {
  readonly field: keyof SlipCriteria | "query";
  readonly code: SlipCriteriaErrorCode;
  constructor(field: keyof SlipCriteria | "query", code: SlipCriteriaErrorCode) {
    super("Invalid or incompatible slip criteria."); this.name = "SlipCriteriaError"; this.field = field; this.code = code;
  }
}
function fail(field: keyof SlipCriteria | "query", code: SlipCriteriaErrorCode): never { throw new SlipCriteriaError(field, code); }

export function defaultSlipCriteria(today: string): SlipCriteria {
  const from = parseReportingDate(today);
  return { dateFrom: from, dateTo: addReportingDays(from, 30), timeFrom: "", timeTo: "", markets: [...publicPolicy.markets],
    totalMin: slipBuilderRules.minimumOddsHundredths, totalMax: slipBuilderRules.maximumTotalOddsHundredths,
    oddsMin: slipBuilderRules.minimumOddsHundredths, oddsMax: slipBuilderRules.maximumOddsHundredths, probMin: 0, probMax: 100,
    teamsMin: 1, teamsMax: slipBuilderRules.maximumSelections, slips: 3, reuse: false };
}
const outcomeKeys = new Map(publicPolicy.markets.map((family) => [`picks.${family}`, family]));
const keys = new Set(["dateFrom", "dateTo", "timeFrom", "timeTo", "markets", "totalMin", "totalMax", "oddsMin", "oddsMax",
  "probMin", "probMax", "teamsMin", "teamsMax", "slips", "reuse", "build", ...outcomeKeys.keys()]);
const parameterLimits = Object.freeze({ maximumEntries: keys.size + publicPolicy.markets.length
  + Object.values(marketSelections).reduce((total, selections) => total + selections.length - 1, 0), maximumBytes: 2048, maximumValueLength: 256 });
function parameters(input: FeedParameters): Map<string, string> {
  const result = new Map<string, string>();
  // Stream submitted entries: a large repeated key must not allocate an intermediate array or joined string.
  function* entries(): Generator<[string, unknown]> {
    if (input instanceof URLSearchParams) { yield* input.entries(); return; }
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      const value = input[key];
      const family = outcomeKeys.get(key);
      if (Array.isArray(value) && (key === "markets" || key === "reuse" || family)) {
        const maximum = key === "markets" ? publicPolicy.markets.length : family ? marketSelections[family].length : 2;
        if (value.length > maximum) fail("query", "invalid-query");
        if (family && value.length === 0) fail("outcomes", "invalid-pick");
        for (const item of value) yield [key, item];
      } else yield [key, value];
    }
  }
  let entryCount = 0, queryBytes = 0, marketCount = 0;
  const outcomeCounts = new Map<MarketFamily, number>();
  for (const [key, value] of entries()) {
    if (++entryCount > parameterLimits.maximumEntries) fail("query", "invalid-query");
    if (value === undefined) continue;
    if (!keys.has(key) || typeof value !== "string" || value.length > parameterLimits.maximumValueLength) fail("query", "invalid-query");
    // Form encoding is ASCII; this measures encoded UTF-8 bytes, including separators, before any aggregation.
    queryBytes += new URLSearchParams([[key, value]]).toString().length + 1;
    if (queryBytes > parameterLimits.maximumBytes) fail("query", "invalid-query");
    if (key === "markets") {
      marketCount += value.split(",").length;
      if (marketCount > publicPolicy.markets.length) fail("markets", "invalid-market");
    }
    const family = outcomeKeys.get(key);
    if (family) {
      const count = (outcomeCounts.get(family) ?? 0) + value.split(",").length;
      if (count > marketSelections[family].length) fail("outcomes", "invalid-pick");
      outcomeCounts.set(family, count);
    }
    const previous = result.get(key);
    if (key === "reuse" && previous === "0" && value === "1") { result.set(key, "1"); continue; }
    if (previous !== undefined && (key !== "markets" && !family || previous === "" || value === "")) fail("query", "invalid-query");
    result.set(key, previous === undefined ? value : `${previous},${value}`);
  }
  if (result.has("build") && result.get("build") !== "1") fail("query", "invalid-query");
  return result;
}
function oddsBound(value: string | undefined, fallback: number, blank: number, field: keyof SlipCriteria, maximum: number): number {
  if (value === undefined) return fallback;
  if (value === "") return blank;
  const match = /^(0|[1-9]\d{0,5})(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) fail(field, "invalid-odds-range");
  const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return result >= slipBuilderRules.minimumOddsHundredths && result <= maximum ? result : fail(field, "invalid-odds-range");
}
function integer(value: string | undefined, fallback: number, maximum: number, field: keyof SlipCriteria): number {
  const code = field === "slips" ? "invalid-slip-count" : "invalid-selection-range";
  if (value === undefined || value === "" && field !== "slips") return fallback;
  if (!/^[1-9]\d?$/u.test(value)) fail(field, code);
  const result = Number(value);
  return result <= maximum ? result : fail(field, code);
}

export function parseSlipCriteria(input: FeedParameters, today: string): SlipCriteria {
  const defaults = defaultSlipCriteria(today), values = parameters(input), get = (key: string) => values.get(key);
  const dateFrom = get("dateFrom") || defaults.dateFrom;
  let dateTo = get("dateTo") || defaults.dateTo;
  try {
    if (!get("dateTo")) dateTo = addReportingDays(parseReportingDate(dateFrom), 30);
    validateReportingDateRange(dateFrom, dateTo, slipBuilderRules.maximumDays);
  }
  catch { fail("dateFrom", "invalid-date-range"); }
  const timeFrom = get("timeFrom") ?? "", timeTo = get("timeTo") ?? "";
  if ((timeFrom !== "" || timeTo !== "") && !validKickoffTime({ from: timeFrom, to: timeTo, zone: publicPolicy.reportingTimeZone })) {
    fail("timeFrom", "invalid-time-range");
  }
  if (get("build") === "1" && get("markets") === undefined) fail("markets", "invalid-market");
  const requested = get("markets")?.split(",") ?? defaults.markets;
  if (requested.length === 0 || requested.length > 4 || requested.some((family) => !isMarketFamily(family))) fail("markets", "invalid-market");
  const markets = publicPolicy.markets.filter((family) => requested.includes(family));
  const outcomes: Partial<Record<MarketFamily, readonly MarketSelection[]>> = {};
  for (const family of publicPolicy.markets) {
    const value = get(`picks.${family}`);
    if (value === undefined || value === "auto") continue;
    const choices = value.split(",");
    if (choices.length === 0 || choices.some((selection) => !isMarketSelection(family, selection))) fail("outcomes", "invalid-pick");
    // Native forms retain checked outcome drafts when their market checkbox is unchecked.
    if (!markets.includes(family)) continue;
    outcomes[family] = marketSelections[family].filter((selection) => choices.includes(selection));
  }
  const totalMin = oddsBound(get("totalMin"), defaults.totalMin, slipBuilderRules.minimumOddsHundredths, "totalMin", slipBuilderRules.maximumTotalOddsHundredths);
  const totalMax = oddsBound(get("totalMax"), defaults.totalMax, slipBuilderRules.maximumTotalOddsHundredths, "totalMax", slipBuilderRules.maximumTotalOddsHundredths);
  const oddsMin = oddsBound(get("oddsMin"), defaults.oddsMin, slipBuilderRules.minimumOddsHundredths, "oddsMin", slipBuilderRules.maximumOddsHundredths);
  const oddsMax = oddsBound(get("oddsMax"), defaults.oddsMax, slipBuilderRules.maximumOddsHundredths, "oddsMax", slipBuilderRules.maximumOddsHundredths);
  if (totalMin > totalMax) fail("totalMin", "invalid-odds-range");
  if (oddsMin > oddsMax) fail("oddsMin", "invalid-odds-range");
  const probMin = !get("probMin") ? defaults.probMin : parseProbabilityValue(get("probMin")!);
  const probMax = !get("probMax") ? defaults.probMax : parseProbabilityValue(get("probMax")!);
  if (probMin === null || probMax === null || probMin > probMax) fail("probMin", "invalid-probability-range");
  const teamsMin = integer(get("teamsMin"), defaults.teamsMin, slipBuilderRules.maximumSelections, "teamsMin");
  const teamsMax = integer(get("teamsMax"), defaults.teamsMax, slipBuilderRules.maximumSelections, "teamsMax");
  if (teamsMin > teamsMax) fail("teamsMin", "invalid-selection-range");
  const slips = integer(get("slips"), defaults.slips, slipBuilderRules.maximumSlips, "slips"), reuseValue = get("reuse") ?? (defaults.reuse ? "1" : "0");
  if (reuseValue !== "0" && reuseValue !== "1") fail("reuse", "invalid-query");
  return { dateFrom, dateTo, timeFrom, timeTo, markets, ...(Object.keys(outcomes).length > 0 ? { outcomes } : {}),
    totalMin, totalMax, oddsMin, oddsMax, probMin, probMax, teamsMin, teamsMax, slips, reuse: reuseValue === "1" };
}

/** Canonical, complete criteria so a native GET form and an interactive form share one URL. */
export function serializeSlipCriteria(criteria: SlipCriteria): URLSearchParams {
  const result = new URLSearchParams();
  result.set("dateFrom", criteria.dateFrom); result.set("dateTo", criteria.dateTo);
  result.set("timeFrom", criteria.timeFrom); result.set("timeTo", criteria.timeTo);
  if (!Array.isArray(criteria.markets) || criteria.markets.length === 0 || criteria.markets.some((family) => !isMarketFamily(family))) fail("markets", "invalid-market");
  result.set("markets", publicPolicy.markets.filter((family) => criteria.markets.includes(family)).join(","));
  if (criteria.outcomes !== undefined) {
    if (!criteria.outcomes || typeof criteria.outcomes !== "object" || Array.isArray(criteria.outcomes)) fail("outcomes", "invalid-pick");
    for (const family in criteria.outcomes) {
      if (!Object.hasOwn(criteria.outcomes, family)) continue;
      if (!isMarketFamily(family)) fail("outcomes", "invalid-pick");
      const choices = criteria.outcomes[family];
      if (!criteria.markets.includes(family) || !Array.isArray(choices) || choices.length === 0 || choices.length > marketSelections[family].length
        || choices.some((selection) => !isMarketSelection(family, selection))) fail("outcomes", "invalid-pick");
    }
    for (const family of publicPolicy.markets) {
      const choices = criteria.outcomes[family];
      if (choices) result.set(`picks.${family}`, marketSelections[family].filter((selection) => choices.includes(selection)).join(","));
    }
  }
  for (const field of ["totalMin", "totalMax", "oddsMin", "oddsMax"] as const) {
    if (!Number.isSafeInteger(criteria[field])) fail(field, "invalid-odds-range");
    result.set(field, formatOddsHundredths(criteria[field]));
  }
  for (const field of ["probMin", "probMax"] as const) result.set(field, formatProbabilityValue(criteria[field]));
  for (const field of ["teamsMin", "teamsMax", "slips"] as const) result.set(field, String(criteria[field]));
  if (typeof criteria.reuse !== "boolean") fail("reuse", "invalid-query");
  result.set("reuse", criteria.reuse ? "1" : "0");
  parseSlipCriteria(result, criteria.dateFrom);
  return result;
}

type Candidate = { selection: SlipSelection; scaledOdds: bigint; key: string };
type Combination = { slip: BuiltSlip; product: bigint; denominator: bigint; key: string };
const SCALE = 10_000n;
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareCandidates(left: Candidate, right: Candidate): number {
  return right.selection.probability - left.selection.probability
    || (left.scaledOdds > right.scaledOdds ? -1 : left.scaledOdds < right.scaledOdds ? 1 : 0) || compareText(left.key, right.key);
}
function compareCombinations(left: Combination, right: Combination): number {
  const oddsDifference = left.product * right.denominator - right.product * left.denominator;
  return left.slip.selections.length - right.slip.selections.length
    || right.slip.averageProbability - left.slip.averageProbability
    || (oddsDifference > 0n ? -1 : oddsDifference < 0n ? 1 : 0) || compareText(left.key, right.key);
}
function totalText(product: bigint, denominator: bigint): string {
  const hundredths = (product * 200n + denominator) / (denominator * 2n);
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}
function combination(selected: readonly Candidate[], product: bigint): Combination {
  const ordered = [...selected].sort((left, right) => left.selection.kickoffAt - right.selection.kickoffAt || compareText(left.key, right.key));
  const selections = ordered.map((candidate) => candidate.selection), key = selected.map((candidate) => candidate.key).sort().join("|");
  const denominator = SCALE ** BigInt(selected.length);
  return { key, product, denominator, slip: { id: key, selections, totalOdds: totalText(product, denominator),
    oddsBasis: selections[0]!.oddsBasis, averageProbability: selections.reduce((sum, item) => sum + item.probability, 0) / selections.length } };
}

/** Exact compatible-batch search: maximize the requested count, then compare ordered slip ranks lexicographically.
 * This avoids a greedy best slip excluding a feasible larger batch. Work is explicitly bounded. */
function compatibleBatch(combinations: readonly Combination[], requested: number): { slips: BuiltSlip[]; limited: boolean } {
  let best: Combination[] = [], nodes = 0, limited = false, complete = false;
  const selected: Combination[] = [], fixtures = new Set<string>();
  function visit(start: number) {
    if (selected.length > best.length) best = [...selected];
    if (selected.length === requested) { complete = true; return; }
    if (selected.length + combinations.length - start <= best.length) return;
    for (let index = start; index < combinations.length && !complete && !limited; index++) {
      if (++nodes > slipBuilderRules.maximumBatchNodes) { limited = true; break; }
      const current = combinations[index]!;
      if (current.slip.selections.some((item) => fixtures.has(item.fixtureId))) continue;
      current.slip.selections.forEach((item) => fixtures.add(item.fixtureId)); selected.push(current);
      visit(index + 1);
      selected.pop(); current.slip.selections.forEach((item) => fixtures.delete(item.fixtureId));
    }
  }
  visit(0);
  return { slips: best.map((item) => item.slip), limited };
}

/** Uses only public, current, pre-cutoff published outcome probabilities and their own approved fresh prices.
 * No provider calls, synthetic prices, score guesses, stored slip writes or joint-probability assumptions. */
export function buildSlips(criteria: SlipCriteria, records: readonly SlipMatchRecord[], asOf: number, ranking?: SlipRanking): SlipBuildResult {
  serializeSlipCriteria(criteria); utcInstantFromEpochMilliseconds(asOf);
  const range = validateReportingDateRange(criteria.dateFrom, criteria.dateTo, slipBuilderRules.maximumDays);
  const timeWindows = criteria.timeFrom === "" ? null : kickoffTimeWindows(range,
    { from: criteria.timeFrom, to: criteria.timeTo, zone: publicPolicy.reportingTimeZone });
  const candidates: Candidate[] = [], seen = new Set<string>(), qualifying = new Set<string>();
  let excludedMissingOdds = 0, excludedMissingForecast = 0, searchLimited = false;
  const minimumProbability = probabilityFraction(criteria.probMin), maximumProbability = probabilityFraction(criteria.probMax);
  for (const record of records) {
    if (seen.has(record.fixtureId)) continue;
    seen.add(record.fixtureId);
    const kickoff = record.kickoffAt;
    if (record.status !== "scheduled" || kickoff === null || kickoff <= asOf + calendarRules.cutoffSecondsBeforeKickoff * 1000
      || kickoff < range.window.startInclusive || kickoff >= range.window.endExclusive
      || timeWindows && !timeWindows.some((window) => kickoff >= window.start && kickoff < window.end)) continue;
    const forecast = record.forecast;
    if (record.cycle?.state !== "open" || record.cycle.mode !== "current" || record.update.prediction !== "current"
      || !forecast || record.cycleId === null || forecast.provisional || forecast.updateDelayed || forecast.publishedAt > asOf
      || forecast.publishedAt >= kickoff - calendarRules.cutoffSecondsBeforeKickoff * 1000) { excludedMissingForecast++; continue; }
    let hasRequestedForecast = false, missingOdds = false;
    for (const { market, outcome } of forecast.markets) {
      if (!criteria.markets.includes(market.family) || outcome && outcome.status !== "pending") continue;
      hasRequestedForecast = true;
      const requested = criteria.outcomes?.[market.family] ?? marketSelections[market.family];
      for (const selection of requested) {
        const probability = (market.probabilities as Readonly<Record<string, number>>)[selection];
        if (!isMarketSelection(market.family, selection) || probability === undefined || !Number.isFinite(probability)
          || probability < 0 || probability > 1 || probability < minimumProbability || probability > maximumProbability) continue;
        const price = (record.selectionPrices ?? record.prices).find((item) => item.family === market.family && item.selection === selection);
        const odds = price && price.basis === "bookmaker" && price.retrievedAt <= asOf && (price.providerUpdatedAt === null || price.providerUpdatedAt <= asOf)
          ? parseDecimalOdds(price.price) : null;
        if (!price || !odds) { missingOdds = true; continue; }
        if (odds.scaled < BigInt(criteria.oddsMin) * 100n || odds.scaled > BigInt(criteria.oddsMax) * 100n) continue;
        const reference: SlipForecastReference = { cycleId: record.cycleId, revisionId: forecast.revisionId, publishedAt: forecast.publishedAt };
        const key = `${record.fixtureId}:${market.family}:${selection}:${probability}:${price.price}`
          + `:${reference.cycleId}:${reference.revisionId}:${reference.publishedAt}`;
        candidates.push({ key, scaledOdds: odds.scaled, selection: { fixtureId: record.fixtureId, kickoffAt: kickoff,
          homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition, family: market.family,
          selection, probability, odds: price.price, oddsBasis: price.basis, forecast: reference } });
        qualifying.add(record.fixtureId);
      }
    }
    if (!hasRequestedForecast) excludedMissingForecast++;
    if (missingOdds && !qualifying.has(record.fixtureId)) excludedMissingOdds++;
  }
  candidates.sort(compareCandidates);
  if (candidates.length > slipBuilderRules.maximumCandidates) { candidates.length = slipBuilderRules.maximumCandidates; searchLimited = true; }
  const retained: Combination[] = [];
  const compare = ranking ? (left: Combination, right: Combination) => ranking.compare(left.slip, right.slip) : compareCombinations;
  let searchNodes = 0, exhausted = false;
  const selected: Candidate[] = [], fixtures = new Set<string>();
  function retain(value: Combination) {
    if (ranking && !ranking.accepts(value.slip)) return;
    // Max-heap keeps the worst retained slip at the root, bounding both memory and insertion work.
    if (retained.length < slipBuilderRules.maximumCombinations) {
      let index = retained.push(value) - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compare(retained[index]!, retained[parent]!) <= 0) break;
        [retained[index], retained[parent]] = [retained[parent]!, retained[index]!]; index = parent;
      }
      return;
    }
    searchLimited = true;
    if (compare(value, retained[0]!) >= 0) return;
    retained[0] = value;
    let index = 0;
    while (index * 2 + 1 < retained.length) {
      let worse = index * 2 + 1;
      if (worse + 1 < retained.length && compare(retained[worse + 1]!, retained[worse]!) > 0) worse++;
      if (compare(retained[worse]!, retained[index]!) <= 0) break;
      [retained[index], retained[worse]] = [retained[worse]!, retained[index]!]; index = worse;
    }
  }
  function enumerate(start: number, target: number, product: bigint) {
    if (selected.length === target) {
      const denominator = SCALE ** BigInt(target);
      if (product * 100n >= BigInt(criteria.totalMin) * denominator) retain(combination(selected, product));
      return;
    }
    if (candidates.length - start < target - selected.length) return;
    for (let index = start; index < candidates.length && !exhausted; index++) {
      if (++searchNodes > slipBuilderRules.maximumSearchNodes) { exhausted = true; searchLimited = true; break; }
      const candidate = candidates[index]!;
      if (fixtures.has(candidate.selection.fixtureId) || selected.length > 0 && candidate.selection.oddsBasis !== selected[0]!.selection.oddsBasis) continue;
      const nextProduct = product * candidate.scaledOdds, denominator = SCALE ** BigInt(selected.length + 1);
      if (nextProduct * 100n > BigInt(criteria.totalMax) * denominator) continue;
      selected.push(candidate); fixtures.add(candidate.selection.fixtureId);
      enumerate(index + 1, target, nextProduct);
      selected.pop(); fixtures.delete(candidate.selection.fixtureId);
    }
  }
  let slips: BuiltSlip[] = [];
  for (let count = criteria.teamsMin; count <= Math.min(criteria.teamsMax, qualifying.size) && !exhausted; count++) {
    enumerate(0, count, 1n);
    const combinations = [...retained].sort(compare);
    if (criteria.reuse) slips = combinations.slice(0, criteria.slips).map((item) => item.slip);
    else {
      const batch = compatibleBatch(combinations, criteria.slips); slips = batch.slips; searchLimited ||= batch.limited;
    }
    if (!ranking && slips.length === criteria.slips) break;
  }
  return { slips, qualifyingMatches: qualifying.size, excludedMissingOdds, excludedMissingForecast, searchLimited };
}
