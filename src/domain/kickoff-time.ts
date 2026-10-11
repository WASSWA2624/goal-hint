import { addReportingDays, type ReportingDateRange } from "./calendar.ts";

export type KickoffTimeFilter = Readonly<{ from: string; to: string; zone: string }>;
export function validKickoffTime(value: KickoffTimeFilter): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.to) || value.from > value.to || value.zone.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value.zone }); return true; } catch { return false; }
}

/** UTC intervals for local calendar days and inclusive wall-clock minutes. Offset segments preserve
 * both occurrences of repeated DST times and exclude nonexistent times, without database zone tables. */
export function kickoffTimeWindows(range: ReportingDateRange, filter: KickoffTimeFilter): { start: number; end: number }[] {
  if (!validKickoffTime(filter)) throw new RangeError("Invalid kickoff time filter");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: filter.zone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const offset = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === name)!.value;
    return Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`) - instant;
  };
  const first = Date.parse(`${range.startDate}T00:00:00Z`) - 86400000;
  const last = Date.parse(`${addReportingDays(range.endDate, 1)}T00:00:00Z`) + 86400000;
  const segments: { start: number; end: number; offset: number }[] = [];
  let start = first, current = offset(first);
  for (let probe = first + 21600000; probe <= last; probe += 21600000) {
    const next = offset(probe);
    if (next !== current) {
      let low = probe - 21600000, high = probe;
      while (high - low > 1000) {
        const middle = low + Math.floor((high - low) / 2000) * 1000;
        if (offset(middle) === current) low = middle; else high = middle;
      }
      segments.push({ start, end: high, offset: current }); start = high; current = next;
    }
  }
  segments.push({ start, end: last, offset: current });
  const windows: { start: number; end: number }[] = [];
  for (let day = 0; day < range.dayCount; day++) {
    const date = addReportingDays(range.startDate, day);
    const from = Date.parse(`${date}T${filter.from}:00Z`), to = Date.parse(`${date}T${filter.to}:00Z`) + 60000;
    for (const segment of segments) {
      const start = Math.max(segment.start, from - segment.offset), end = Math.min(segment.end, to - segment.offset);
      if (start < end) windows.push({ start, end });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}
