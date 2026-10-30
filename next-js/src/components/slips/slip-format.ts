import type { Messages } from "@/i18n/messages";
import { getReportingDayBounds, type ReportingDate } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { resolveLocale } from "../../i18n/locales.ts";

const publicationDateFormats = new Map<string, Intl.DateTimeFormat>();

/** Named EAT publication dates retain their weekday, with English ordinal days. */
export function formatSlipPublicationDate(day: ReportingDate, locale: string): string {
  const language = resolveLocale(locale);
  let formatter = publicationDateFormats.get(language);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory",
      weekday: "short", day: "numeric", month: "long", year: "numeric" });
    publicationDateFormats.set(language, formatter);
  }
  const parts = formatter.formatToParts(getReportingDayBounds(day).startInclusive);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  const date = Number(day.slice(-2)), lastTwo = date % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Readonly<Record<number, string>>)[date % 10] ?? "th";
  return `${part("weekday")}, ${part("day")}${suffix} ${part("month")}, ${part("year")}`;
}

/** Keep original probability precision without rounding a near-certain forecast to a guarantee. */
export function formatSlipProbability(value: number, messages: Messages): string {
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
