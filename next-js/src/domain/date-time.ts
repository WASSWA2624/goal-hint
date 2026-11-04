import { parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type ReportingDateRange } from "./calendar.ts";
import { validTimeZone } from "./device-calendar.ts";
import { kickoffTimeWindows } from "./kickoff-time.ts";

export type DateTimeInterval = Readonly<{ from: string; to: string }>;
const minuteWindows = new Map<string, Readonly<{ start: number; end: number }>>();

/** Date-time editors exchange local calendar minutes, never implicit host-zone parsing. */
export function parseLocalDateTime(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) throw new RangeError("Invalid local date and time.");
  parseReportingDate(value.slice(0, 10));
  return value;
}

function minuteWindow(value: string, zone: string) {
  const key = `${value}|${zone}`, cached = minuteWindows.get(key);
  if (cached) return cached;
  const day = parseReportingDate(value.slice(0, 10)), time = value.slice(11);
  const windows = kickoffTimeWindows(validateReportingDateRange(day, day, 1), { from: time, to: time, zone });
  if (!windows.length) throw new RangeError("This local time does not exist in the device time zone.");
  const window = Object.freeze({ start: windows[0]!.start, end: windows.at(-1)!.end });
  if (minuteWindows.size >= 256) minuteWindows.delete(minuteWindows.keys().next().value!);
  minuteWindows.set(key, window);
  return window;
}

/** Inclusive wall-clock minutes become one UTC interval; fold endpoints retain both occurrences. */
export function dateTimeIntervalRange(interval: DateTimeInterval, zone: string, maximumDays = 366): ReportingDateRange {
  const from = parseLocalDateTime(interval.from), to = parseLocalDateTime(interval.to);
  if (!validTimeZone(zone) || from > to) throw new RangeError("Invalid date-time interval.");
  const range = validateReportingDateRange(parseReportingDate(from.slice(0, 10)), parseReportingDate(to.slice(0, 10)), maximumDays);
  const startInclusive = utcInstantFromEpochMilliseconds(minuteWindow(from, zone).start);
  const endExclusive = utcInstantFromEpochMilliseconds(minuteWindow(to, zone).end);
  if (startInclusive >= endExclusive) throw new RangeError("Invalid date-time interval.");
  return { ...range, window: { startInclusive, endExclusive } };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Format an instant for the shared editor in an explicit zone; date-only fields stay civil dates. */
export function localDateTimeValue(at: number, zone: string): string {
  if (!validTimeZone(zone)) throw new RangeError("Invalid time zone.");
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", { timeZone: zone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value!);
    formatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(utcInstantFromEpochMilliseconds(at));
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === name)!.value;
  return parseLocalDateTime(`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`);
}
