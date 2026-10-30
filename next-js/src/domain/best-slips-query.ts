import { addReportingDays, parseReportingDate, validateReportingDateRange, type ReportingDate } from "./calendar.ts";
import { bestSlipsRules } from "./best-slips.ts";
import { slipPageSize } from "./slip-pagination.ts";

export const bestSlipsPeriods = ["today", "yesterday", "tomorrow", "last3", "last7", "last30", "next3", "next7", "next30", "all", "custom"] as const;
export const bestSlipsStatuses = ["all", "won", "lost", "pending", "void", "cancelled"] as const;
export type BestSlipsPeriod = typeof bestSlipsPeriods[number];
export type BestSlipsStatus = typeof bestSlipsStatuses[number];
export const bestSlipsQueryRules = Object.freeze({ maximumDays: 366, pageSize: slipPageSize, scanDays: 31, maximumPage: 9999 });
export type BestSlipsQuery = Readonly<{
  period: BestSlipsPeriod; status: BestSlipsStatus; from?: ReportingDate; to?: ReportingDate; page: number; cursor?: string;
}>;
export type BestSlipsDates = Readonly<{ from: ReportingDate | null; to: ReportingDate | null }>;
export class BestSlipsQueryError extends Error {
  readonly code: "invalid-query" | "invalid-date" | "invalid-range" | "range-too-large";
  constructor(code: BestSlipsQueryError["code"]) {
    super(`Invalid BetSlip filter: ${code}.`); this.name = "BestSlipsQueryError"; this.code = code;
  }
}
const fail = (code: BestSlipsQueryError["code"]): never => { throw new BestSlipsQueryError(code); };
export const defaultBestSlipsQuery = (entitled = true): BestSlipsQuery => ({ period: entitled ? "today" : "yesterday", status: "all", page: 1 });

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
  const match = /^(\d{4}-\d{2}-\d{2}):([1-9]\d{0,2})$/u.exec(value);
  if (!match) return fail("invalid-query");
  let day: ReportingDate;
  try { day = parseReportingDate(match[1]); } catch { return fail("invalid-query"); }
  const rank = Number(match[2]);
  if (rank > bestSlipsRules.count) return fail("invalid-query");
  return { day, rank };
}

export function parseBestSlipsQuery(input: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>, today: ReportingDate): BestSlipsQuery {
  const value = (key: string): string | undefined => {
    const values = input instanceof URLSearchParams ? input.getAll(key) : input[key];
    if (Array.isArray(values)) {
      if (values.length > 1) return fail("invalid-query");
      return values[0];
    }
    return values;
  };
  const period = value("period") ?? "today", status = value("status") ?? "all", pageValue = value("page") ?? "1";
  if (!bestSlipsPeriods.includes(period as BestSlipsPeriod) || !bestSlipsStatuses.includes(status as BestSlipsStatus)
    || !/^[1-9]\d{0,3}$/u.test(pageValue)) return fail("invalid-query");
  const page = Number(pageValue), cursor = value("cursor");
  if (page > bestSlipsQueryRules.maximumPage || cursor !== undefined && period !== "all") return fail("invalid-query");
  if (cursor !== undefined) parseBestSlipsCursor(cursor);
  const dates = period === "custom" ? customDates(value("from"), value("to")) : null;
  const query: BestSlipsQuery = { period: period as BestSlipsPeriod, status: status as BestSlipsStatus, page,
    ...(dates?.from && dates.to ? { from: dates.from, to: dates.to } : {}), ...(cursor === undefined ? {} : { cursor }) };
  resolveBestSlipsDates(query, today);
  return query;
}

export function serializeBestSlipsQuery(query: BestSlipsQuery): URLSearchParams {
  const result = new URLSearchParams({ period: query.period, status: query.status, page: String(query.page) });
  if (query.period === "custom") { result.set("from", query.from ?? ""); result.set("to", query.to ?? ""); }
  if (query.period === "all" && query.cursor !== undefined) result.set("cursor", query.cursor);
  return result;
}
