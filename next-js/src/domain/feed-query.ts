import { isAnyKickoffTime, validKickoffTime, type KickoffTimeFilter } from "./kickoff-time.ts";
import {
  addReportingDays, parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type ReportingDate, type ReportingDateRange,
} from "./calendar.ts";
import { getDateInTimeZone, getDayBoundsInTimeZone, validTimeZone } from "./device-calendar.ts";
import { isMarketFamily, type MarketFamily } from "./markets.ts";
import { formatOddsRange, oddsRules, parseOddsRange, type OddsRange } from "./odds.ts";
import { publicPolicy } from "./public-policy.ts";
import { resolveLocale, type Locale } from "../i18n/locales.ts";

export const feedStatuses = ["all", "scheduled", "live", "finished", "postponed", "canceled", "abandoned", "awarded", "unknown"] as const;
export type FeedStatus = (typeof feedStatuses)[number];
/** Shared status choices for the unified Matches interface; transport codes remain stable. */
export const feedFilterStatuses = ["all", "scheduled", "live", "finished"] as const satisfies readonly FeedStatus[];
export type FeedFilterStatus = (typeof feedFilterStatuses)[number];
export const feedDatePresets = ["last-30-days", "last-7-days", "last-3-days", "yesterday", "today", "tomorrow", "next-3-days", "next-7-days", "next-30-days"] as const;
export type FeedDatePreset = (typeof feedDatePresets)[number];
export const defaultFeedDatePreset: FeedDatePreset = "last-30-days";
const presetDays: Readonly<Record<FeedDatePreset, { offset: number; days: number }>> = Object.freeze({
  "last-30-days": { offset: -29, days: 30 },
  "last-7-days": { offset: -6, days: 7 }, "last-3-days": { offset: -2, days: 3 }, yesterday: { offset: -1, days: 1 },
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
  /** Browsing calendar zone; independent of whether a kickoff-time constraint is active. */
  zone?: string | null;
  /** Local kickoff minutes and IANA device zone; absent means all times. */
  time?: KickoffTimeFilter | null;
  /** Canonical competition IDs, sorted; empty means every league. */
  leagues: string[];
  /** Canonical competition country names, sorted; empty means every country. */
  countries: string[];
  status: FeedStatus;
  /** Selected market families in policy order. Each fixture shows its best pick among them. */
  markets: MarketFamily[];
  /** Inclusive unrounded percentage bounds (decimals allowed) on the shown pick; 0–100 applies no filter. */
  probability: ProbabilityRange;
  /** Inclusive two-place price bounds (hundredths) on the shown pick's own market price; null applies no
   * filter. Accepted only while publicPolicy.features.providerOdds is on (052). */
  odds: OddsRange | null;
  picks: PicksFilter;
  sort: FeedSort;
  page: number;
  pageSize: number;
}>;
/** Configured provider competitions; API-Football currently lists about 1,250 current leagues. */
export const maximumCompetitionScope = 2000;
export type FeedParameters = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;
// The default is the last 30 days; explicit ranges may span up to a year (a safety bound, not a product limit).
export const feedQueryRules = Object.freeze({ maximumDays: 366, maximumSearchLength: 120, pageSize: 50, maximumPageSize: 100,
  maximumPage: 10_000, maximumLeagues: 50, maximumCountries: 50 });
/** Any market: each fixture shows its highest-probability available pick across all supported families. */
export const defaultMarkets: readonly MarketFamily[] = publicPolicy.markets;
export const anyProbability: ProbabilityRange = Object.freeze({ min: 0, max: 100 });
export const defaultSortDirection: Readonly<Record<FeedSortField, FeedSortDirection>> = Object.freeze({ kickoff: "desc", probability: "desc" });
export const feedDefaults = Object.freeze({
  today: Object.freeze({ dayOffset: 0, status: "all" }),
  results: Object.freeze({ dayOffset: -1, status: "finished" }),
} as const);

export class FeedQueryError extends RangeError {
  constructor() { super("Invalid or incompatible feed parameters."); this.name = "FeedQueryError"; }
}
function fail(): never { throw new FeedQueryError(); }
const keys = new Set(["date", "from", "to", "when", "timeFrom", "timeTo", "tz", "q", "league", "country", "status", "market", "prob", "odds", "picks", "sort", "dir", "page", "pageSize"]);
export const feedQueryKeys: ReadonlySet<string> = keys;
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

/** Complete plain decimal percentage; no signs, exponents, leading zeros, or silent nonzero underflow. */
export function parseProbabilityValue(value: string): number | null {
  if (typeof value !== "string") return null;
  const match = /^(0|[1-9]\d{0,2})(?:\.(\d+))?$/u.exec(value);
  if (!match || match[1] === "100" && /[1-9]/u.test(match[2] ?? "")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 && !(number === 0 && /[1-9]/u.test(value)) ? number : null;
}

export function validProbabilityRange(range: ProbabilityRange): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0 && range.max <= 100 && range.min <= range.max;
}

/** Shortest round-trippable decimal, with scientific notation expanded for plain-decimal URLs. */
export function formatProbabilityValue(value: number): string {
  if (!validProbabilityRange({ min: value, max: value })) fail();
  const [mantissa, exponent] = String(value).split("e");
  return exponent === undefined ? mantissa! : `0.${"0".repeat(-Number(exponent) - 1)}${mantissa!.replace(".", "")}`;
}

/** Shift the decimal percentage text before reading the fraction: arithmetic division can move exact boundaries. */
export function probabilityFraction(value: number): number {
  const [whole, fraction = ""] = formatProbabilityValue(value).split(".");
  const digits = whole!.padStart(3, "0");
  return Number(`${digits.slice(0, -2)}.${digits.slice(-2)}${fraction}`);
}

function probabilityRange(value: string | undefined): ProbabilityRange {
  if (value === undefined) return anyProbability;
  const parts = value.split("-");
  if (parts.length !== 2) fail();
  const min = parseProbabilityValue(parts[0]!), max = parseProbabilityValue(parts[1]!);
  return min !== null && max !== null && validProbabilityRange({ min, max }) ? { min, max } : fail();
}

export function isAnyProbability(range: ProbabilityRange): boolean {
  return range.min === anyProbability.min && range.max === anyProbability.max;
}

type FeedCalendarQuery = Partial<Pick<FeedQuery, "zone" | "time">>;
export function getFeedToday(query: FeedCalendarQuery, asOf: number): ReportingDate {
  const zone = query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone;
  if (!validTimeZone(zone)) fail();
  return getDateInTimeZone(utcInstantFromEpochMilliseconds(asOf), zone);
}

/** `today` is the caller's browsing date; server callers may supply one captured instant instead. */
export function resolveFeedDates(query: Pick<FeedQuery, "dates"> & FeedCalendarQuery, today: ReportingDate, asOf?: number): ReportingDateRange {
  const zone = query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone;
  if (!validTimeZone(zone)) fail();
  const localToday = asOf === undefined ? today : getFeedToday(query, asOf);
  const dates = query.dates;
  let range: ReportingDateRange;
  if (dates.kind === "date" || dates.kind === "range") {
    const from = dates.kind === "date" ? dates.date : dates.from;
    range = validateReportingDateRange(from, dates.kind === "range" ? dates.to : from, feedQueryRules.maximumDays);
  } else {
    const preset = presetDays[dates.kind];
    if (!preset) fail();
    const from = addReportingDays(parseReportingDate(localToday), preset.offset);
    range = validateReportingDateRange(from, addReportingDays(from, preset.days - 1), feedQueryRules.maximumDays);
  }
  if (zone === publicPolicy.reportingTimeZone) return range;
  const start = getDayBoundsInTimeZone(range.startDate, zone), end = getDayBoundsInTimeZone(range.endDate, zone);
  return { ...range, window: { startInclusive: start.startInclusive, endExclusive: end.endExclusive } };
}

/** True for the slider's two extremes (1.01 and 1000.00): no bound at all, so the canonical form is null. */
export function isAnyOdds(range: OddsRange | null): boolean {
  return range === null || range.min === oddsRules.minimumHundredths && range.max === oddsRules.maximumHundredths;
}
/** Strict odds bounds; while provider odds are off, `odds` is an unknown key (any value, even empty, fails).
 * Both extremes mean no filter and are omitted, like `prob=0-100`. */
function oddsRange(value: string | undefined, enabled: boolean): OddsRange | null {
  if (value === undefined) return null;
  if (!enabled) fail();
  const range = parseOddsRange(value) ?? fail();
  return isAnyOdds(range) ? null : range;
}

/** Shared by pages, future public endpoints and browser URL controls. No clock reads.
 * `providerOdds` defaults to publicPolicy.features.providerOdds; only isolated tests override it. */
export function parseFeedQuery(input: FeedParameters, context: { today: ReportingDate; asOf?: number; locale?: string; routeDate?: string; providerOdds?: boolean }): FeedQuery {
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
      dates = { kind: (when ?? defaultFeedDatePreset) as FeedDatePreset };
    }
  }
  const timeFrom = get("timeFrom"), timeTo = get("timeTo"), zone = get("tz");
  if (zone !== undefined && !validTimeZone(zone)) fail();
  const bounds = { from: timeFrom ?? "", to: timeTo ?? timeFrom ?? "" };
  const time = (bounds.from === "" && bounds.to === "") || isAnyKickoffTime(bounds) ? null
    : { ...bounds, zone: zone ?? "" };
  if (time && !validKickoffTime(time)) fail();
  resolveFeedDates({ dates, ...(zone === undefined ? {} : { zone }), ...(time ? { time } : {}) }, context.today, context.asOf);
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
    locale: resolveLocale(context.locale), dates, search, ...(zone === undefined ? {} : { zone }), ...(time ? { time } : {}),
    leagues, countries, status: parseFeedStatus(get("status")), markets,
    probability: probabilityRange(get("prob")), odds: oddsRange(get("odds"), context.providerOdds ?? publicPolicy.features.providerOdds), picks,
    sort: { by, direction: direction ?? defaultSortDirection[by] },
    page: integer(get("page"), 1, feedQueryRules.maximumPage),
    pageSize: integer(get("pageSize"), feedQueryRules.pageSize, feedQueryRules.maximumPageSize),
  };
}

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

/** Pages default to predictions where that filter is available; API defaults remain unrestricted. */
export function defaultPagePicks(status: FeedStatus, subscriberOnly = false): PicksFilter {
  return subscriberOnly && status !== "finished" ? "all" : "only";
}

/** Explicit choices, including an unchecked filter, take precedence over the page default. */
export function applyFeedPageDefaults(query: FeedQuery, input: FeedParameters, subscriberOnly = false): FeedQuery {
  const explicit = input instanceof URLSearchParams ? input.has("picks") : input.picks !== undefined;
  return explicit ? query : { ...query, picks: defaultPagePicks(query.status, subscriberOnly) };
}

export function isAnyMarkets(markets: readonly MarketFamily[]): boolean {
  return sameList(canonicalMarkets(markets), defaultMarkets);
}

/** Canonical parameter order and omitted defaults make equivalent URLs share a key. */
export function serializeFeedQuery(query: FeedQuery, today: ReportingDate): URLSearchParams {
  if (![...feedDatePresets, "date", "range"].includes(query.dates.kind) || !["kickoff", "probability"].includes(query.sort.by) ||
      !["asc", "desc"].includes(query.sort.direction)) fail();
  const result = new URLSearchParams();
  const dates = query.dates;
  if (dates.kind === "date") result.set("date", dates.date);
  else if (dates.kind === "range") { result.set("from", dates.from); result.set("to", dates.to); }
  else if (dates.kind !== defaultFeedDatePreset) result.set("when", dates.kind);
  if (query.time) {
    if (!validKickoffTime(query.time)) fail();
    if (!isAnyKickoffTime(query.time)) {
      result.set("timeFrom", query.time.from); result.set("timeTo", query.time.to);
    }
    result.set("tz", query.time.zone);
  }
  if (query.zone !== undefined && query.zone !== null) {
    if (!validTimeZone(query.zone) || query.time && query.time.zone !== query.zone) fail();
    result.set("tz", query.zone);
  }
  if (query.search) result.set("q", query.search);
  const leagues = [...new Set(query.leagues)].sort(), countries = [...new Set(query.countries.map((item) => item.normalize("NFC")))].sort();
  if (leagues.length > 0) result.set("league", leagues.join(","));
  if (countries.length > 0) result.set("country", countries.join(","));
  if (query.status !== feedDefaults.today.status) result.set("status", query.status);
  const markets = canonicalMarkets(query.markets);
  if (!isAnyMarkets(markets)) result.set("market", markets.join(","));
  if (!isAnyProbability(query.probability)) result.set("prob", `${formatProbabilityValue(query.probability.min)}-${formatProbabilityValue(query.probability.max)}`);
  const requested = query.odds ?? null;
  if (requested !== null && (![requested.min, requested.max].every((value) => Number.isSafeInteger(value) &&
    value >= oddsRules.minimumHundredths && value <= oddsRules.maximumHundredths) || requested.min > requested.max)) fail();
  const odds = isAnyOdds(requested) ? null : requested;
  if (odds !== null) result.set("odds", formatOddsRange(odds));
  if (query.picks === "only") result.set("picks", "only");
  else if (query.picks !== "all") fail();
  if (query.sort.by !== "kickoff") result.set("sort", query.sort.by);
  if (query.sort.direction !== defaultSortDirection[query.sort.by]) result.set("dir", query.sort.direction);
  if (query.page !== 1) result.set("page", String(query.page));
  if (query.pageSize !== feedQueryRules.pageSize) result.set("pageSize", String(query.pageSize));
  // Validate callers as well as URL inputs; never silently normalize an invalid query.
  // An odds range can only exist in a query that parsed it, so the re-check accepts the key it serialized.
  const checked = parseFeedQuery(result, { today, locale: query.locale, ...(odds === null ? {} : { providerOdds: true }) });
  if (checked.search !== query.search || checked.page !== query.page || checked.pageSize !== query.pageSize ||
      checked.locale !== query.locale || !sameList(checked.leagues, leagues) || !sameList(checked.countries, countries) ||
      checked.status !== query.status || !sameList(checked.markets, markets) ||
      checked.probability.min !== query.probability.min || checked.probability.max !== query.probability.max ||
      checked.odds?.min !== odds?.min || checked.odds?.max !== odds?.max || checked.picks !== query.picks ||
      checked.zone !== (query.zone ?? query.time?.zone)) fail();
  return result;
}

export function feedQueryHref(query: FeedQuery, today: ReportingDate): string {
  const parameters = serializeFeedQuery(query, today);
  // Page defaults differ from the public API: retain an intentional opt-out on navigation.
  if (query.picks === "all") parameters.set("picks", "all");
  const dates = query.dates;
  let path = `/${resolveLocale(query.locale)}`;
  if (dates.kind === "date" || dates.kind === "range") {
    path += `/predictions/${dates.kind === "date" ? dates.date : dates.from}`;
    parameters.delete("date"); parameters.delete("from");
  } else path += "/matches";
  const search = parameters.toString();
  return search ? `${path}?${search}` : path;
}

/** Data/list identity excludes page position and includes resolved browsing dates, zone and locale. */
export function feedQueryKey(query: FeedQuery, today: ReportingDate): string {
  const range = resolveFeedDates(query, today);
  const resolved: FeedQuery = { ...query, page: 1, dates: pinnedDateSelection(range) };
  return `${resolveLocale(query.locale)}?${serializeFeedQuery(resolved, today).toString()}`;
}

/** One resolved day pins to a date, several to an explicit range; keys, pagination and canonical URLs share this. */
export function pinnedDateSelection(range: ReportingDateRange): DateSelection {
  return range.dayCount === 1 ? { kind: "date", date: range.startDate } : { kind: "range", from: range.startDate, to: range.endDate };
}

/** Filters that narrow the cohort (dates and order excluded). */
/** Choices made inside the filter panel itself: leagues, countries, markets, probability and odds. */
export function panelFilterCount(query: Pick<FeedQuery, "leagues" | "countries" | "markets" | "probability"> & Partial<Pick<FeedQuery, "odds" | "time">>): number {
  return query.leagues.length + query.countries.length +
    Number(!isAnyMarkets(query.markets)) + Number(!isAnyProbability(query.probability)) +
    Number(!isAnyOdds(query.odds ?? null)) + Number(!isAnyKickoffTime(query.time));
}

export function activeFeedFilterCount(query: FeedQuery): number {
  return Number(query.search !== "") + panelFilterCount(query) + Number(query.picks === "only") +
    Number(query.status !== feedDefaults.today.status);
}
