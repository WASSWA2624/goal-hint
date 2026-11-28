import { addReportingDays, parseReportingDate, validateReportingDateRange, type ReportingDate } from "./calendar.ts";
import { matchesPredictionResult, predictionResultFilters, type PredictionResult } from "./performance-summary.ts";
import { slipPageSize } from "./slip-pagination.ts";
import { formatProbabilityValue, parseProbabilityValue } from "./feed-query.ts";
import { bestSlipOddsBands, defaultBestSlipOddsBand, parseBestSlipPublicRank, type BestSlipOddsBand } from "./best-slip-odds-bands.ts";

export const bestSlipsPeriods = ["today", "yesterday", "tomorrow", "last3", "last7", "last30", "next3", "next7", "next30", "all", "custom"] as const;
export const bestSlipsStatuses = ["all", ...predictionResultFilters] as const;
export type BestSlipsPeriod = typeof bestSlipsPeriods[number];
export type BestSlipsStatus = typeof bestSlipsStatuses[number];
export function matchesBestSlipsStatus(result: PredictionResult, filter: BestSlipsStatus): boolean {
  return filter === "all" || matchesPredictionResult(result, filter);
}
export const bestSlipsQueryRules = Object.freeze({ maximumDays: 366, pageSize: slipPageSize, scanDays: 31, maximumPage: 9999, maximumWindowPages: 3 });
export type BestSlipsQuery = Readonly<{
  period: BestSlipsPeriod; status: BestSlipsStatus; oddsBand?: BestSlipOddsBand; from?: ReportingDate; to?: ReportingDate;
  probMin?: number; probMax?: number; matchesMin?: number; matchesMax?: number;
  page: number; cursor?: string; summary?: "yesterday";
}>;
export const bestSlipsRangeFields = ["probMin", "probMax", "matchesMin", "matchesMax"] as const;
export type BestSlipsRangeField = typeof bestSlipsRangeFields[number];
export type BestSlipsDates = Readonly<{ from: ReportingDate | null; to: ReportingDate | null }>;
export type BestSlipsWindow = Readonly<{ through: number; knownVersion?: string }>;
export class BestSlipsQueryError extends Error {
  readonly code: "invalid-query" | "invalid-date" | "invalid-range" | "range-too-large";
  constructor(code: BestSlipsQueryError["code"]) {
    super(`Invalid Best Slips filter: ${code}.`); this.name = "BestSlipsQueryError"; this.code = code;
  }
}
const fail = (code: BestSlipsQueryError["code"]): never => { throw new BestSlipsQueryError(code); };
const defaultBestSlipsStatus = "pending";
export const defaultBestSlipsQuery = (): BestSlipsQuery => ({ period: "today", status: defaultBestSlipsStatus, oddsBand: defaultBestSlipOddsBand, page: 1 });

export function parseBestSlipsWindow(query: BestSlipsQuery, through: string, knownVersion?: string): BestSlipsWindow {
  if (query.period === "all" || query.cursor !== undefined || !/^[1-9]\d{0,3}$/u.test(through)
    || knownVersion !== undefined && !/^[0-9a-f]{64}$/u.test(knownVersion)) return fail("invalid-query");
  const lastPage = Number(through);
  if (lastPage < query.page || lastPage > bestSlipsQueryRules.maximumPage
    || lastPage - query.page >= bestSlipsQueryRules.maximumWindowPages) return fail("invalid-query");
  return { through: lastPage, ...(knownVersion === undefined ? {} : { knownVersion }) };
}

function customDates(from: unknown, to: unknown): BestSlipsDates {
  let start: ReportingDate, end: ReportingDate;
  try { start = parseReportingDate(from); end = parseReportingDate(to); }
  catch { return fail("invalid-date"); }
  if (start > end) return fail("invalid-range");
  try { validateReportingDateRange(start, end, bestSlipsQueryRules.maximumDays); }
  catch { return fail("range-too-large"); }
  return { from: start, to: end };
}

/** Presets are civil publication dates in EAT, independent of the browser's zone. */
export function resolveBestSlipsDates(query: BestSlipsQuery, today: ReportingDate): BestSlipsDates {
  const day = parseReportingDate(today);
  if (query.period === "all") return { from: null, to: null };
  if (query.period === "custom") return customDates(query.from, query.to);
  if (query.period === "today") return { from: day, to: day };
  if (query.period === "yesterday" || query.period === "tomorrow") {
    const date = addReportingDays(day, query.period === "yesterday" ? -1 : 1);
    return { from: date, to: date };
  }
  if (query.period === "last3" || query.period === "last7" || query.period === "last30") {
    return { from: addReportingDays(day, 1 - Number(query.period.slice(4))), to: day };
  }
  if (query.period === "next3" || query.period === "next7" || query.period === "next30") {
    return { from: addReportingDays(day, 1), to: addReportingDays(day, Number(query.period.slice(4))) };
  }
  return fail("invalid-query");
}

/** Public continuation identity contains only a publication date and its original rank. */
export function parseBestSlipsCursor(value: string): Readonly<{ day: ReportingDate; rank: number }> {
  const match = /^(\d{4}-\d{2}-\d{2}):([1-9]\d{0,10})$/u.exec(value);
  if (!match) return fail("invalid-query");
  let day: ReportingDate;
  try { day = parseReportingDate(match[1]); } catch { return fail("invalid-query"); }
  const rank = parseBestSlipPublicRank(match[2]!);
  if (rank === null) return fail("invalid-query");
  return { day, rank };
}

function parseMatchCount(value: string): number | null {
  const count = Number(value);
  return /^\d+$/u.test(value) && Number.isSafeInteger(count) && count > 0 ? count : null;
}

/** Average probability bounds use percentage points, match bounds use whole matches, and both are inclusive. */
export function matchesBestSlipsRanges(query: BestSlipsQuery, { averageProbability, matchCount }: {
  averageProbability: number; matchCount: number;
}): boolean {
  return averageProbability >= (query.probMin ?? 0) / 100 && averageProbability <= (query.probMax ?? 100) / 100
    && matchCount >= (query.matchesMin ?? 1) && matchCount <= (query.matchesMax ?? Number.MAX_SAFE_INTEGER);
}

export function parseBestSlipsQuery(input: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  today: ReportingDate, defaultStatus: BestSlipsStatus = defaultBestSlipsStatus): BestSlipsQuery {
  const value = (key: string): string | undefined => {
    const values = input instanceof URLSearchParams ? input.getAll(key) : input[key];
    if (Array.isArray(values)) {
      if (values.length > 1) return fail("invalid-query");
      return values[0];
    }
    return values;
  };
  const period = value("period") ?? "today", status = value("status") ?? defaultStatus, pageValue = value("page") ?? "1";
  if (!bestSlipsPeriods.includes(period as BestSlipsPeriod) || !bestSlipsStatuses.includes(status as BestSlipsStatus)
    || !/^[1-9]\d{0,3}$/u.test(pageValue)) return fail("invalid-query");
  const summary = value("summary");
  const oddsBand = value("oddsBand") ?? defaultBestSlipOddsBand;
  if (!bestSlipOddsBands.some(band => band.id === oddsBand)) return fail("invalid-query");
  if (summary !== undefined && summary !== "yesterday") return fail("invalid-query");
  const page = Number(pageValue), cursor = value("cursor");
  if (page > bestSlipsQueryRules.maximumPage || cursor !== undefined && period !== "all") return fail("invalid-query");
  if (cursor !== undefined) parseBestSlipsCursor(cursor);
  const dates = period === "custom" ? customDates(value("from"), value("to")) : null;
  const ranges: Partial<Record<BestSlipsRangeField, number>> = {};
  for (const field of bestSlipsRangeFields) {
    const raw = value(field);
    if (raw === undefined || raw === "") continue;
    const number = field.startsWith("prob") ? parseProbabilityValue(raw) : parseMatchCount(raw);
    if (number === null) return fail("invalid-query");
    ranges[field] = number;
  }
  if ((ranges.probMin ?? 0) > (ranges.probMax ?? 100)
    || (ranges.matchesMin ?? 1) > (ranges.matchesMax ?? Number.MAX_SAFE_INTEGER)) return fail("invalid-range");
  const query: BestSlipsQuery = { period: period as BestSlipsPeriod, status: status as BestSlipsStatus, oddsBand: oddsBand as BestSlipOddsBand, page,
    ...(dates?.from && dates.to ? { from: dates.from, to: dates.to } : {}), ...ranges,
    ...(cursor === undefined ? {} : { cursor }), ...(summary ? { summary } : {}) };
  resolveBestSlipsDates(query, today);
  return query;
}

export function serializeBestSlipsQuery(query: BestSlipsQuery): URLSearchParams {
  const result = new URLSearchParams({ period: query.period, status: query.status, page: String(query.page) });
  result.set("oddsBand", query.oddsBand ?? defaultBestSlipOddsBand);
  if (query.summary) result.set("summary", query.summary);
  if (query.period === "custom") { result.set("from", query.from ?? ""); result.set("to", query.to ?? ""); }
  for (const field of bestSlipsRangeFields) {
    const value = query[field];
    if (value !== undefined) result.set(field, field.startsWith("prob") ? formatProbabilityValue(value) : String(value));
  }
  if (query.period === "all" && query.cursor !== undefined) result.set("cursor", query.cursor);
  return result;
}

/** Keep the default collection URL clean; nondefault queries can be reloaded or shared. */
export function bestSlipsPageSearch(query: BestSlipsQuery): string {
  const search = serializeBestSlipsQuery(query).toString();
  return search === serializeBestSlipsQuery(defaultBestSlipsQuery()).toString() ? "" : `?${search}`;
}

/** Outcome drilldowns retain the selected period and odds band, restarting pagination. */
export function selectSlipSummaryResult(applied: BestSlipsQuery, status: BestSlipsStatus): BestSlipsQuery {
  const scope = { ...applied };
  delete scope.cursor;
  return { ...scope, status, oddsBand: applied.oddsBand ?? defaultBestSlipOddsBand, page: 1 };
}

/** Calendar choices retain active filters and restart at the first page of the chosen publication dates. */
export function selectBestSlipsDates(applied: BestSlipsQuery, from: ReportingDate, to: ReportingDate, today: ReportingDate): BestSlipsQuery {
  const scope = { ...applied };
  delete scope.cursor;
  delete scope.from;
  delete scope.to;
  return from === today && to === today ? { ...scope, period: "today", page: 1 }
    : { ...scope, period: "custom", from, to, page: 1 };
}
