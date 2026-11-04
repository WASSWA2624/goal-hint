import type { DateEntryMode } from "./date-entry.ts";

export type DatePickerPart = "year" | "month" | "day" | "hour" | "minute";
export type DatePickerParts = Record<DatePickerPart, number>;
const pad = (value: number) => String(value).padStart(2, "0");
export function datePickerValue(parts: DatePickerParts, mode: DateEntryMode): string {
  const date = `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return mode === "time" ? time : mode === "date" ? date : `${date}T${time}`;
}
export function datePickerParts(value: string, mode: DateEntryMode): DatePickerParts {
  const [date, time = "00:00"] = mode === "time" ? ["2000-01-01", value] : value.split("T");
  const [year, month, day] = date!.split("-").map(Number), [hour, minute] = time.split(":").map(Number);
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute! };
}
export function daysInPickerMonth(year: number, month: number): number {
  return month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
const order: DatePickerPart[] = ["year", "month", "day", "hour", "minute"];
/** Bounds are narrowed by the previously selected columns, including partial boundary days. */
export function datePickerPartBounds(parts: DatePickerParts, part: DatePickerPart, mode: DateEntryMode, min?: string, max?: string): [number, number] {
  const low = datePickerParts(min ?? (mode === "time" ? "00:00" : mode === "date" ? "0001-01-01" : "0001-01-01T00:00"), mode);
  const high = datePickerParts(max ?? (mode === "time" ? "23:59" : mode === "date" ? "9999-12-31" : "9999-12-31T23:59"), mode);
  const prefix = order.slice(mode === "time" ? 3 : 0, order.indexOf(part));
  const minimum = part === "year" ? 1 : part === "month" || part === "day" ? 1 : 0;
  const maximum = part === "year" ? 9999 : part === "month" ? 12 : part === "day" ? daysInPickerMonth(parts.year, parts.month) : part === "hour" ? 23 : 59;
  return [prefix.every(key => parts[key] === low[key]) ? Math.max(minimum, low[part]) : minimum,
    prefix.every(key => parts[key] === high[key]) ? Math.min(maximum, high[part]) : maximum];
}
/** Clamp in calendar order so changing JAN 31 to FEB always yields a real date. */
export function constrainDatePicker(parts: DatePickerParts, mode: DateEntryMode, min?: string, max?: string): DatePickerParts {
  const next = { ...parts };
  for (const part of mode === "time" ? order.slice(3) : mode === "date" ? order.slice(0, 3) : order) {
    const [low, high] = datePickerPartBounds(next, part, mode, min, max);
    next[part] = Math.max(low, Math.min(high, next[part]));
  }
  return next;
}
