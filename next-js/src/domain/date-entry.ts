import { parseReportingDate } from "./calendar.ts";
import { parseLocalDateTime } from "./date-time.ts";

export type DateEntryMode = "date" | "datetime" | "time";
export type DateEntryIssue = "empty" | "incomplete" | "day" | "month" | "date" | "time";
export const shortMonths = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
export const dateEntryFormat = (mode: DateEntryMode) => mode === "time" ? "HH:mm" : mode === "datetime" ? "DD-MMM-YYYY HH:mm" : "DD-MMM-YYYY";

/** Form values stay canonical while visible dates use one browser-independent format. */
export function formatDateEntry(value: string, mode: DateEntryMode): string {
  if (!value || mode === "time") return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/u.exec(value);
  if (!match || !shortMonths[Number(match[2]) - 1]) return value;
  return `${match[3]}-${shortMonths[Number(match[2]) - 1]}-${match[1]}${mode === "datetime" && match[4] ? ` ${match[4]}` : ""}`;
}

/** Incomplete edits are distinct from impossible dates and invalid clock values. */
export function parseDateEntry(text: string, mode: DateEntryMode): Readonly<{ value: string; issue: DateEntryIssue | null }> {
  const raw = text.trim().toUpperCase().replace(/\s+/gu, " ");
  const invalid = (issue: DateEntryIssue) => ({ value: "", issue });
  if (!raw) return invalid("empty");
  if (mode === "time") {
    const match = /^(\d{1,2}):?(\d{2})$/u.exec(raw);
    if (!match) return invalid(raw.length < 5 && /^[\d:]*$/u.test(raw) ? "incomplete" : "time");
    return Number(match[1]) <= 23 && Number(match[2]) <= 59
      ? { value: `${match[1]!.padStart(2, "0")}:${match[2]}`, issue: null } : invalid("time");
  }
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/u.test(raw)) {
    try { return { value: mode === "datetime" ? parseLocalDateTime(raw) : parseReportingDate(raw), issue: null }; }
    catch { return invalid("date"); }
  }
  const match = /^(\d{1,2})[- ]?([A-Z]{3})[- ]?(\d{4})(?:[ T]?(\d{1,2}):?(\d{2}))?$/u.exec(raw);
  if (!match) {
    const day = /^(\d{2})/u.exec(raw), month = /^\d{1,2}[- ]?([A-Z]+)/u.exec(raw);
    if (day && (Number(day[1]) < 1 || Number(day[1]) > 31)) return invalid("day");
    if (/^\d{1,2}[- ]\d/u.test(raw) || month && !shortMonths.some(value => value.startsWith(month[1]!))) return invalid("month");
    return invalid(raw.length < (mode === "datetime" ? 17 : 11) ? "incomplete" : "date");
  }
  const month = shortMonths.indexOf(match[2] as typeof shortMonths[number]);
  if (month < 0) return invalid("month");
  if (Number(match[1]) < 1 || Number(match[1]) > 31) return invalid("day");
  const date = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  try { parseReportingDate(date); } catch { return invalid("date"); }
  if (mode === "date") return match[4] ? invalid("date") : { value: date, issue: null };
  if (!match[4] || !match[5]) return invalid("incomplete");
  const value = `${date}T${match[4].padStart(2, "0")}:${match[5]}`;
  try { return { value: parseLocalDateTime(value), issue: null }; } catch { return invalid("time"); }
}
