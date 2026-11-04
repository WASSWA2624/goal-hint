import { dateEntryMonth, formatDateEntry, parseDateEntry, shortMonths, type DateEntryMode } from "./date-entry.ts";
import { daysInPickerMonth } from "./date-picker.ts";

export type DateEntryPart = "day" | "month" | "year" | "hour" | "minute";
export type DateEntryParts = Record<DateEntryPart, string>;
export const dateEntryPartsByMode = {
  date: ["day", "month", "year"],
  datetime: ["day", "month", "year", "hour", "minute"],
  time: ["hour", "minute"],
} as const;

export function splitDateEntry(value: string, mode: DateEntryMode): DateEntryParts {
  const parts: DateEntryParts = { day: "", month: "", year: "", hour: "", minute: "" };
  const values = formatDateEntry(value, mode).toUpperCase().match(/[A-Z]+|\d+/gu) ?? [];
  dateEntryPartsByMode[mode].forEach((part, index) => { parts[part] = values[index] ?? ""; });
  return parts;
}

function dayLimit(parts: DateEntryParts) {
  const month = dateEntryMonth(parts.month);
  // Permit February 29 while the year is incomplete, then clamp once the year is known.
  const year = parts.year.length === 4 ? Number(parts.year) : 2000;
  return month >= 1 && month <= 12 ? daysInPickerMonth(year, month) : 31;
}

/** Reject out-of-range keystrokes while allowing a leading zero or a month prefix. */
export function changeDateEntryPart(parts: DateEntryParts, part: DateEntryPart, raw: string): DateEntryParts | null {
  const value = raw.trim().toUpperCase();
  const number = Number(value);
  if (value) {
    if (part === "month") {
      const valid = /^\d{1,2}$/u.test(value) ? number <= 12 && (number > 0 || value === "0")
        : shortMonths.some(month => month.startsWith(value));
      if (!valid) return null;
    } else if (part === "year") {
      if (!/^\d{1,4}$/u.test(value) || value === "0000") return null;
    } else {
      const maximum = part === "day" ? dayLimit(parts) : part === "hour" ? 23 : 59;
      if (!/^\d{1,2}$/u.test(value) || number > maximum || part === "day" && value === "00") return null;
    }
  }
  const next = { ...parts, [part]: value };
  if ((part === "month" || part === "year") && Number(next.day) > dayLimit(next)) next.day = String(dayLimit(next));
  return next;
}

export function normalizeDateEntryParts(parts: DateEntryParts): DateEntryParts {
  const pad = (value: string) => value ? value.padStart(2, "0") : "";
  return { ...parts, month: shortMonths[dateEntryMonth(parts.month) - 1] ?? parts.month,
    day: parts.day === "0" ? "0" : pad(parts.day), hour: pad(parts.hour), minute: pad(parts.minute) };
}

export function parseDateEntryParts(parts: DateEntryParts, mode: DateEntryMode): ReturnType<typeof parseDateEntry> {
  const fields = dateEntryPartsByMode[mode];
  if (fields.every(part => !parts[part])) return { value: "", issue: "empty" };
  if (fields.some(part => !parts[part])) return { value: "", issue: "incomplete" };
  if (mode !== "time" && (parts.day === "0" || parts.month === "0" || parts.year.length < 4)) return { value: "", issue: "incomplete" };
  const { day, month, year, hour, minute } = normalizeDateEntryParts(parts);
  const date = `${day}-${month}-${year}`, time = `${hour}:${minute}`;
  return parseDateEntry(mode === "time" ? time : mode === "date" ? date : `${date} ${time}`, mode);
}
