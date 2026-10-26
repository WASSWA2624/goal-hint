import { addReportingDays, parseReportingDate, type ReportingDate } from "./calendar.ts";
import { analyticsRules, type ComparisonMode } from "./analytics.ts";

/** Dashboard periods are whole reporting days in the site's Kampala (EAT) calendar. */
export const analyticsPresets = Object.freeze({
  today: "Today",
  yesterday: "Yesterday",
  "last-7": "Last 7 days",
  "last-30": "Last 30 days",
  "last-90": "Last 90 days",
  "last-365": "Last 12 months",
  "this-month": "This month",
  "last-month": "Last month",
});
export type AnalyticsPreset = keyof typeof analyticsPresets;
export type DateRange = Readonly<{ from: ReportingDate; to: ReportingDate }>;
export type Granularity = "hour" | "day" | "week";

const DAY_MS = 86_400_000;
const day = (value: ReportingDate) => Date.parse(`${value}T00:00:00Z`) / DAY_MS;

export function rangeDays(range: DateRange): number {
  return day(range.to) - day(range.from) + 1;
}

export function presetRange(preset: AnalyticsPreset, today: ReportingDate): DateRange {
  const monthStart = parseReportingDate(`${today.slice(0, 7)}-01`);
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": { const value = addReportingDays(today, -1); return { from: value, to: value }; }
    case "last-7": return { from: addReportingDays(today, -6), to: today };
    case "last-30": return { from: addReportingDays(today, -29), to: today };
    case "last-90": return { from: addReportingDays(today, -89), to: today };
    case "last-365": return { from: addReportingDays(today, -364), to: today };
    case "this-month": return { from: monthStart, to: today };
    case "last-month": {
      const to = addReportingDays(monthStart, -1);
      return { from: parseReportingDate(`${to.slice(0, 7)}-01`), to };
    }
  }
}

/** Validate an inclusive range: ordered, real dates and no longer than the retention ceiling. */
export function parseDateRange(from: unknown, to: unknown): DateRange {
  const range = { from: parseReportingDate(from), to: parseReportingDate(to) };
  const days = rangeDays(range);
  if (days < 1) throw new RangeError("The start date must not be after the end date.");
  if (days > analyticsRules.maximumRangeDays) throw new RangeError("Choose a period of at most three years.");
  return range;
}

function shiftYear(value: ReportingDate, years: number): ReportingDate {
  const year = Number(value.slice(0, 4)) + years;
  const candidate = `${String(year).padStart(4, "0")}${value.slice(4)}`;
  // 29 February maps to 28 February in a common year.
  try { return parseReportingDate(candidate); } catch { return parseReportingDate(`${candidate.slice(0, 8)}28`); }
}

export function comparisonRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "year") return { from: shiftYear(range.from, -1), to: shiftYear(range.to, -1) };
  const days = rangeDays(range);
  return { from: addReportingDays(range.from, -days), to: addReportingDays(range.from, -1) };
}

export function granularityFor(range: DateRange): Granularity {
  const days = rangeDays(range);
  return days <= 2 ? "hour" : days <= 120 ? "day" : "week";
}

/** Monday that starts the ISO week containing a date. */
export function weekStart(value: ReportingDate): ReportingDate {
  const weekday = (new Date(day(value) * DAY_MS).getUTCDay() + 6) % 7;
  return addReportingDays(value, -weekday);
}

/** Every bucket key in order, matching the collector's SQL keys: `YYYY-MM-DD HH`, `YYYY-MM-DD` or a week's Monday. */
export function bucketKeys(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  if (granularity === "week") {
    for (let current = weekStart(range.from); current <= range.to; current = addReportingDays(current, 7)) keys.push(current);
    return keys;
  }
  for (let current = range.from; current <= range.to; current = addReportingDays(current, 1)) {
    if (granularity === "day") keys.push(current);
    else for (let hour = 0; hour < 24; hour++) keys.push(`${current} ${String(hour).padStart(2, "0")}`);
  }
  return keys;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short axis label for a bucket key, e.g. `14 Oct`, `14 Oct 09:00` or `w/c 13 Oct`. */
export function bucketLabel(key: string, granularity: Granularity): string {
  const month = monthNames[Number(key.slice(5, 7)) - 1] ?? "";
  const date = `${Number(key.slice(8, 10))} ${month}`;
  if (granularity === "hour") return `${date} ${key.slice(11, 13)}:00`;
  return granularity === "week" ? `w/c ${date}` : date;
}

export function formatRange(range: Readonly<{ from: string; to: string }>): string {
  const label = (value: string) => `${Number(value.slice(8, 10))} ${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return range.from === range.to ? label(range.from) : `${label(range.from)} – ${label(range.to)}`;
}
