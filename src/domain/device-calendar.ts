import {
  parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange,
  type InstantWindow, type ReportingDate, type UtcInstant,
} from "./calendar.ts";
import { kickoffTimeWindows } from "./kickoff-time.ts";

/** Browsing dates are civil dates in an explicit IANA zone; operational dates remain EAT. */
const validatedZones = new Map<string, boolean>();
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return false;
  const cached = validatedZones.get(value);
  if (cached !== undefined) return cached;
  let valid = false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); valid = true; } catch { /* Invalid IANA zone. */ }
  if (validatedZones.size < 128) validatedZones.set(value, valid);
  return valid;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(zone: string) {
  const cached = formatters.get(zone);
  if (cached) return cached;
  if (!validTimeZone(zone)) throw new RangeError("Invalid browsing timezone.");
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, calendar: "gregory", numberingSystem: "latn",
    era: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  if (formatters.size < 64) formatters.set(zone, formatter);
  return formatter;
}

/** Capture the clock at the caller; this helper never reads device or server time. */
export function getDateInTimeZone(at: UtcInstant, zone: string): ReportingDate {
  const parts = dateFormatter(zone).formatToParts(utcInstantFromEpochMilliseconds(at));
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === name)?.value;
  if (part("era") !== "AD") throw new RangeError("Browsing date is outside the supported calendar.");
  return parseReportingDate(`${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`);
}

/** Use the same offset segments as kickoff filtering, including 23/25-hour DST days. */
const dayBounds = new Map<string, InstantWindow>();
export function getDayBoundsInTimeZone(date: ReportingDate, zone: string): InstantWindow {
  const key = `${date}|${zone}`, cached = dayBounds.get(key);
  if (cached) return cached;
  const range = validateReportingDateRange(date, date, 1);
  const windows = kickoffTimeWindows(range, { from: "00:00", to: "23:59", zone });
  if (windows.length === 0) throw new RangeError("Browsing date does not exist in this timezone.");
  const bounds = Object.freeze({ startInclusive: utcInstantFromEpochMilliseconds(windows[0]!.start),
    endExclusive: utcInstantFromEpochMilliseconds(windows[windows.length - 1]!.end) });
  if (dayBounds.size >= 256) dayBounds.delete(dayBounds.keys().next().value!);
  dayBounds.set(key, bounds);
  return bounds;
}
