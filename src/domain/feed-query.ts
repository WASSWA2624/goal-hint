import {
  addReportingDays, parseReportingDate, validateReportingDateRange, type ReportingDate,
} from "./calendar.ts";
import { isMarketFamily, type MarketFamily } from "./markets.ts";
import { resolveLocale, type Locale } from "../i18n/locales.ts";

export const feedStatuses = ["all", "scheduled", "live", "finished", "postponed", "canceled", "abandoned", "awarded", "unknown"] as const;
export type FeedStatus = (typeof feedStatuses)[number];
export type DateSelection =
  | Readonly<{ kind: "today" | "tomorrow" | "next-7-days" }>
  | Readonly<{ kind: "date"; date: ReportingDate }>
  | Readonly<{ kind: "range"; from: ReportingDate; to: ReportingDate }>;
export type FeedSort = Readonly<{ by: "kickoff" }> | Readonly<{ by: "probability"; market: MarketFamily }>;
export type FeedQuery = Readonly<{
  locale: Locale;
  dates: DateSelection;
  search: string;
  league: string | null;
  status: FeedStatus;
  market: MarketFamily;
  sort: FeedSort;
  page: number;
  pageSize: number;
}>;
export type FeedParameters = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;
export const feedQueryRules = Object.freeze({ maximumDays: 7, maximumSearchLength: 120, pageSize: 30, maximumPageSize: 100, maximumPage: 10_000 });
export const feedDefaults = Object.freeze({
  today: Object.freeze({ dayOffset: 0, status: "all" }),
  results: Object.freeze({ dayOffset: -1, status: "finished" }),
} as const);

export class FeedQueryError extends RangeError {
  constructor() { super("Invalid or incompatible feed parameters."); this.name = "FeedQueryError"; }
}
function fail(): never { throw new FeedQueryError(); }
const keys = new Set(["date", "from", "to", "when", "q", "league", "status", "market", "sort", "sortMarket", "page", "pageSize"]);

export function parseFeedStatus(value: unknown): FeedStatus {
  const status = value ?? feedDefaults.today.status;
  return typeof status === "string" && (feedStatuses as readonly string[]).includes(status) ? status as FeedStatus : fail();
}

function parameters(input: FeedParameters): Map<string, string> {
  const result = new Map<string, string>();
  const entries = input instanceof URLSearchParams ? input.entries() : Object.entries(input);
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (!keys.has(key) || result.has(key) || typeof value !== "string") fail();
    result.set(key, value);
  }
  return result;
}

function integer(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || value.length > 5) fail();
  const number = Number(value);
  return number <= maximum ? number : fail();
}

export function resolveFeedDates(query: Pick<FeedQuery, "dates">, today: ReportingDate) {
  const dates = query.dates;
  const from = dates.kind === "date" ? dates.date : dates.kind === "range" ? dates.from
    : dates.kind === "tomorrow" ? addReportingDays(today, 1) : parseReportingDate(today);
  const to = dates.kind === "range" ? dates.to : dates.kind === "next-7-days" ? addReportingDays(from, 6) : from;
  return validateReportingDateRange(from, to, feedQueryRules.maximumDays);
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
      if (when !== undefined && !["today", "tomorrow", "next-7-days"].includes(when)) fail();
      dates = { kind: (when ?? "today") as "today" | "tomorrow" | "next-7-days" };
    }
  }
  resolveFeedDates({ dates }, context.today);
  const rawSearch = get("q") ?? "";
  if (rawSearch.length > feedQueryRules.maximumSearchLength || /[\u0000-\u001f\u007f]/u.test(rawSearch)) fail();
  const search = rawSearch.normalize("NFC").trim().replace(/\s+/gu, " ");
  const league = get("league") ?? null;
  if (league !== null && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(league)) fail();
  const market = get("market") ?? "match-result";
  if (!isMarketFamily(market)) fail();
  const by = get("sort") ?? "kickoff";
  const sortMarket = get("sortMarket");
  if (by !== "kickoff" && by !== "probability" || by === "probability" && get("market") === undefined ||
      sortMarket !== undefined && (by !== "probability" || sortMarket !== market)) fail();
  return {
    locale: resolveLocale(context.locale), dates, search, league, status: parseFeedStatus(get("status")), market,
    sort: by === "probability" ? { by, market } : { by },
    page: integer(get("page"), 1, feedQueryRules.maximumPage),
    pageSize: integer(get("pageSize"), feedQueryRules.pageSize, feedQueryRules.maximumPageSize),
  };
}

/** Canonical parameter order and omitted defaults make equivalent URLs share a key. */
export function serializeFeedQuery(query: FeedQuery, today: ReportingDate): URLSearchParams {
  if (!["today", "tomorrow", "next-7-days", "date", "range"].includes(query.dates.kind) ||
      !["kickoff", "probability"].includes(query.sort.by) ||
      query.sort.by === "kickoff" && "market" in query.sort) fail();
  const result = new URLSearchParams();
  const dates = query.dates;
  if (dates.kind === "date") result.set("date", dates.date);
  else if (dates.kind === "range") { result.set("from", dates.from); result.set("to", dates.to); }
  else if (dates.kind !== "today") result.set("when", dates.kind);
  if (query.search) result.set("q", query.search);
  if (query.league !== null) result.set("league", query.league);
  if (query.status !== feedDefaults.today.status) result.set("status", query.status);
  if (query.market !== "match-result" || query.sort.by === "probability") result.set("market", query.market);
  if (query.sort.by === "probability") {
    if (query.sort.market !== query.market) fail();
    result.set("sort", "probability");
  }
  if (query.page !== 1) result.set("page", String(query.page));
  if (query.pageSize !== feedQueryRules.pageSize) result.set("pageSize", String(query.pageSize));
  // Validate callers as well as URL inputs; never silently normalize an invalid query.
  const checked = parseFeedQuery(result, { today, locale: query.locale });
  if (checked.search !== query.search || checked.page !== query.page || checked.pageSize !== query.pageSize ||
      checked.locale !== query.locale || checked.league !== query.league || checked.status !== query.status || checked.market !== query.market) fail();
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
