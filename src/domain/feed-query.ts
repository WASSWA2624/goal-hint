import {
  addReportingDays, parseReportingDate, validateReportingDateRange, type ReportingDate,
} from "./calendar.ts";
import { isMarketFamily, type MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";
import { resolveLocale, type Locale } from "../i18n/locales.ts";

export const feedStatuses = ["all", "scheduled", "live", "finished", "postponed", "canceled", "abandoned", "awarded", "unknown"] as const;
export type FeedStatus = (typeof feedStatuses)[number];
export const feedDatePresets = ["today", "tomorrow", "next-3-days", "next-7-days", "next-30-days"] as const;
export type FeedDatePreset = (typeof feedDatePresets)[number];
const presetDays: Readonly<Record<FeedDatePreset, { offset: number; days: number }>> = Object.freeze({
  today: { offset: 0, days: 1 }, tomorrow: { offset: 1, days: 1 }, "next-3-days": { offset: 0, days: 3 },
  "next-7-days": { offset: 0, days: 7 }, "next-30-days": { offset: 0, days: 30 },
});
export type DateSelection =
  | Readonly<{ kind: FeedDatePreset }>
  | Readonly<{ kind: "date"; date: ReportingDate }>
  | Readonly<{ kind: "range"; from: ReportingDate; to: ReportingDate }>;
export type FeedSortField = "kickoff" | "probability";
export type FeedSortDirection = "asc" | "desc";
export type FeedSort = Readonly<{ by: FeedSortField; direction: FeedSortDirection }>;
export type ProbabilityRange = Readonly<{ min: number; max: number }>;
/** "only" keeps fixtures whose shown pick exists; "all" includes fixtures without a prediction. */
export type PicksFilter = "all" | "only";
export type FeedQuery = Readonly<{
  locale: Locale;
  dates: DateSelection;
  search: string;
  /** Canonical competition IDs, sorted; empty means every league. */
  leagues: string[];
  /** Canonical competition country names, sorted; empty means every country. */
  countries: string[];
  status: FeedStatus;
  /** Selected market families in policy order. Each fixture shows its best pick among them. */
  markets: MarketFamily[];
  /** Whole-percent bounds applied to the shown pick; 0–100 applies no filter. */
  probability: ProbabilityRange;
  picks: PicksFilter;
  sort: FeedSort;
  page: number;
  pageSize: number;
}>;
/** Configured provider competitions; API-Football currently lists about 1,250 current leagues. */
export const maximumCompetitionScope = 2000;
export type FeedParameters = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;
export const feedQueryRules = Object.freeze({ maximumDays: 31, maximumSearchLength: 120, pageSize: 30, maximumPageSize: 100,
  maximumPage: 10_000, maximumLeagues: 50, maximumCountries: 50 });
export const defaultMarkets: readonly MarketFamily[] = Object.freeze(["match-result"]);
export const anyProbability: ProbabilityRange = Object.freeze({ min: 0, max: 100 });
export const defaultSortDirection: Readonly<Record<FeedSortField, FeedSortDirection>> = Object.freeze({ kickoff: "asc", probability: "desc" });
export const feedDefaults = Object.freeze({
  today: Object.freeze({ dayOffset: 0, status: "all" }),
  results: Object.freeze({ dayOffset: -1, status: "finished" }),
} as const);

export class FeedQueryError extends RangeError {
  constructor() { super("Invalid or incompatible feed parameters."); this.name = "FeedQueryError"; }
}
function fail(): never { throw new FeedQueryError(); }
const keys = new Set(["date", "from", "to", "when", "q", "league", "country", "status", "market", "prob", "picks", "sort", "dir", "page", "pageSize"]);
const leaguePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u;
const countryPattern = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'()&-]{0,127}$/u;

export function parseFeedStatus(value: unknown): FeedStatus {
  const status = value ?? feedDefaults.today.status;
  return typeof status === "string" && (feedStatuses as readonly string[]).includes(status) ? status as FeedStatus : fail();
}
export function isFeedDatePreset(value: unknown): value is FeedDatePreset {
  return typeof value === "string" && (feedDatePresets as readonly string[]).includes(value);
}

/** Plain checkbox forms repeat list keys; they join exactly like comma lists. Other keys stay unique. */
const listKeys = new Set(["league", "country", "market"]);
function parameters(input: FeedParameters): Map<string, string> {
  const result = new Map<string, string>();
  const entries: [string, unknown][] = input instanceof URLSearchParams ? [...input.entries()]
    : Object.entries(input).flatMap(([key, value]) => Array.isArray(value) && listKeys.has(key) ? value.map((item) => [key, item] as [string, unknown]) : [[key, value]]);
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (!keys.has(key) || typeof value !== "string") fail();
    const previous = result.get(key);
    if (previous !== undefined && (!listKeys.has(key) || previous === "" || value === "")) fail();
    result.set(key, previous === undefined ? value : `${previous},${value}`);
  }
  return result;
}

function integer(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || value.length > 5) fail();
  const number = Number(value);
  return number <= maximum ? number : fail();
}

/** Comma lists are deduplicated and sorted so equivalent selections share one URL. */
function list(value: string | undefined, pattern: RegExp, maximum: number): string[] {
  // Native GET forms submit the empty "all" option.
  if (value === undefined || value === "") return [];
  const items = value.split(",").map((item) => item.normalize("NFC"));
  if (items.length > maximum || items.some((item) => !pattern.test(item) || item !== item.trim())) fail();
  return [...new Set(items)].sort();
}

export function canonicalMarkets(markets: readonly string[]): MarketFamily[] {
  if (markets.length === 0 || markets.some((market) => !isMarketFamily(market))) fail();
  return publicPolicy.markets.filter((family) => markets.includes(family));
}

function probabilityRange(value: string | undefined): ProbabilityRange {
  if (value === undefined) return anyProbability;
  const match = /^(0|[1-9]\d?|100)-(0|[1-9]\d?|100)$/u.exec(value);
  if (!match) fail();
  const min = Number(match[1]), max = Number(match[2]);
  return min <= max ? { min, max } : fail();
}

export function isAnyProbability(range: ProbabilityRange): boolean {
  return range.min === anyProbability.min && range.max === anyProbability.max;
}

export function resolveFeedDates(query: Pick<FeedQuery, "dates">, today: ReportingDate) {
  const dates = query.dates;
  if (dates.kind === "date" || dates.kind === "range") {
    const from = dates.kind === "date" ? dates.date : dates.from;
    return validateReportingDateRange(from, dates.kind === "range" ? dates.to : from, feedQueryRules.maximumDays);
  }
  const preset = presetDays[dates.kind];
  if (!preset) fail();
  const from = addReportingDays(parseReportingDate(today), preset.offset);
  return validateReportingDateRange(from, addReportingDays(from, preset.days - 1), feedQueryRules.maximumDays);
}

/** Shared by pages, future public endpoints and browser URL controls. No clock reads. */
export function parseFeedQuery(input: FeedParameters, context: { today: ReportingDate; locale?: string; routeDate?: string }): FeedQuery {
  const values = parameters(input);
  const get = (key: string) => values.get(key);
  const date = get("date");
  const from = get("from");
  const to = get("to");
  const when = get("when");
  let dates: DateSelection;
  if (context.routeDate !== undefined) {
    if (date !== undefined || from !== undefined || when !== undefined) fail();
    const start = parseReportingDate(context.routeDate);
    dates = to === undefined ? { kind: "date", date: start } : { kind: "range", from: start, to: parseReportingDate(to) };
  } else {
    if (Number(date !== undefined) + Number(from !== undefined || to !== undefined) + Number(when !== undefined) > 1) fail();
    if (date !== undefined) dates = { kind: "date", date: parseReportingDate(date) };
    else if (from !== undefined || to !== undefined) {
      if (from === undefined || to === undefined) fail();
      dates = { kind: "range", from: parseReportingDate(from), to: parseReportingDate(to) };
    } else {
      if (when !== undefined && !isFeedDatePreset(when)) fail();
      dates = { kind: (when ?? "today") as FeedDatePreset };
    }
  }
  resolveFeedDates({ dates }, context.today);
  const rawSearch = get("q") ?? "";
  if (rawSearch.length > feedQueryRules.maximumSearchLength || /[\u0000-\u001f\u007f]/u.test(rawSearch)) fail();
  const search = rawSearch.normalize("NFC").trim().replace(/\s+/gu, " ");
  const leagues = list(get("league"), leaguePattern, feedQueryRules.maximumLeagues);
  const countries = list(get("country"), countryPattern, feedQueryRules.maximumCountries);
  const marketValue = get("market");
  const markets = marketValue === undefined ? [...defaultMarkets] : canonicalMarkets(marketValue.split(","));
  if (marketValue !== undefined && marketValue.split(",").length !== markets.length) fail();
  const picks = get("picks") ?? "all";
  if (picks !== "all" && picks !== "only") fail();
  const by = get("sort") ?? "kickoff", direction = get("dir");
  if (by !== "kickoff" && by !== "probability" || direction !== undefined && direction !== "asc" && direction !== "desc") fail();
  return {
    locale: resolveLocale(context.locale), dates, search, leagues, countries, status: parseFeedStatus(get("status")), markets,
    probability: probabilityRange(get("prob")), picks,
    sort: { by, direction: direction ?? defaultSortDirection[by] },
    page: integer(get("page"), 1, feedQueryRules.maximumPage),
    pageSize: integer(get("pageSize"), feedQueryRules.pageSize, feedQueryRules.maximumPageSize),
  };
}

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

/** Canonical parameter order and omitted defaults make equivalent URLs share a key. */
export function serializeFeedQuery(query: FeedQuery, today: ReportingDate): URLSearchParams {
  if (![...feedDatePresets, "date", "range"].includes(query.dates.kind) || !["kickoff", "probability"].includes(query.sort.by) ||
      !["asc", "desc"].includes(query.sort.direction)) fail();
  const result = new URLSearchParams();
  const dates = query.dates;
  if (dates.kind === "date") result.set("date", dates.date);
  else if (dates.kind === "range") { result.set("from", dates.from); result.set("to", dates.to); }
  else if (dates.kind !== "today") result.set("when", dates.kind);
  if (query.search) result.set("q", query.search);
  const leagues = [...new Set(query.leagues)].sort(), countries = [...new Set(query.countries.map((item) => item.normalize("NFC")))].sort();
  if (leagues.length > 0) result.set("league", leagues.join(","));
  if (countries.length > 0) result.set("country", countries.join(","));
  if (query.status !== feedDefaults.today.status) result.set("status", query.status);
  const markets = canonicalMarkets(query.markets);
  if (!sameList(markets, defaultMarkets)) result.set("market", markets.join(","));
  if (!isAnyProbability(query.probability)) result.set("prob", `${query.probability.min}-${query.probability.max}`);
  if (query.picks === "only") result.set("picks", "only");
  else if (query.picks !== "all") fail();
  if (query.sort.by !== "kickoff") result.set("sort", query.sort.by);
  if (query.sort.direction !== defaultSortDirection[query.sort.by]) result.set("dir", query.sort.direction);
  if (query.page !== 1) result.set("page", String(query.page));
  if (query.pageSize !== feedQueryRules.pageSize) result.set("pageSize", String(query.pageSize));
  // Validate callers as well as URL inputs; never silently normalize an invalid query.
  const checked = parseFeedQuery(result, { today, locale: query.locale });
  if (checked.search !== query.search || checked.page !== query.page || checked.pageSize !== query.pageSize ||
      checked.locale !== query.locale || !sameList(checked.leagues, leagues) || !sameList(checked.countries, countries) ||
      checked.status !== query.status || !sameList(checked.markets, markets) ||
      checked.probability.min !== query.probability.min || checked.probability.max !== query.probability.max || checked.picks !== query.picks) fail();
  return result;
}

export function feedQueryHref(query: FeedQuery, today: ReportingDate): string {
  const parameters = serializeFeedQuery(query, today);
  const dates = query.dates;
  let path = `/${resolveLocale(query.locale)}`;
  if (dates.kind === "date" || dates.kind === "range") {
    path += `/predictions/${dates.kind === "date" ? dates.date : dates.from}`;
    parameters.delete("date"); parameters.delete("from");
  }
  const search = parameters.toString();
  return search ? `${path}?${search}` : path;
}

/** Data/list identity excludes page position, and includes resolved EAT dates and locale. */
export function feedQueryKey(query: FeedQuery, today: ReportingDate): string {
  const range = resolveFeedDates(query, today);
  const resolved: FeedQuery = { ...query, page: 1, dates: range.dayCount === 1
    ? { kind: "date", date: range.startDate } : { kind: "range", from: range.startDate, to: range.endDate } };
  return `${resolveLocale(query.locale)}?${serializeFeedQuery(resolved, today).toString()}`;
}

/** Filters that narrow the cohort (dates and order excluded). */
/** Choices made inside the filter panel itself: leagues, countries, markets and probability. */
export function panelFilterCount(query: Pick<FeedQuery, "leagues" | "countries" | "markets" | "probability">): number {
  return query.leagues.length + query.countries.length +
    Number(!sameList(canonicalMarkets(query.markets), defaultMarkets)) + Number(!isAnyProbability(query.probability));
}

export function activeFeedFilterCount(query: FeedQuery): number {
  return Number(query.search !== "") + panelFilterCount(query) + Number(query.picks === "only") +
    Number(query.status !== feedDefaults.today.status);
}
