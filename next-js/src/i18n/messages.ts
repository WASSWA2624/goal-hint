import { getKickoffDisplayInput, getReportingDayBounds, utcInstantFromEpochMilliseconds, type ReportingDate, type UtcInstant } from "../domain/calendar.ts";
import { publicPolicy } from "../domain/public-policy.ts";
import { resolveLocale } from "./locales.ts";
import { en } from "./messages/en.ts";
import { matchTouchlineMessages } from "./messages/match-touchline.ts";
import { predictionMessages } from "./messages/predictions.ts";
import { slipsMessages } from "./messages/slips.ts";
import { slipSharingMessages } from "./messages/slip-sharing.ts";
import { slipConfigurationMessages } from "./messages/slip-configurations.ts";
import { accountDashboardMessages } from "./messages/account-dashboard.ts";
import { matchCompetitionMessages } from "./messages/match-competition.ts";
import { appDownloadMessages } from "./messages/app-downloads.ts";

const catalog = { ...en, ...matchTouchlineMessages, ...predictionMessages, ...slipsMessages, ...slipSharingMessages, ...slipConfigurationMessages, ...accountDashboardMessages, ...matchCompetitionMessages, ...appDownloadMessages };

type Formatters = { numbers: Intl.NumberFormat; plurals: Intl.PluralRules; dates: Intl.DateTimeFormat; instants: Intl.DateTimeFormat;
  days: Intl.DateTimeFormat; instantDays: Intl.DateTimeFormat; times: Intl.DateTimeFormat; shortTimes: Intl.DateTimeFormat; mediumDates: Intl.DateTimeFormat;
  spans: Intl.DateTimeFormat; months: Intl.DateTimeFormat; zones: Intl.DateTimeFormat };
// Immutable formatters are shared by locale and display zone; no visitor records are cached.
const formattersByLocale = new Map<string, Formatters>();
function formatters(language: string, timeZone: string): Formatters {
  const key = `${language}|${timeZone}`;
  const existing = formattersByLocale.get(key);
  if (existing) return existing;
  const dateOptions = { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", year: "numeric" } as const;
  const instantOptions = { timeZone, calendar: "gregory", hourCycle: "h23" } as const;
  const dayOptions = { calendar: "gregory", weekday: "short", month: "short", day: "numeric" } as const;
  const created: Formatters = {
    numbers: new Intl.NumberFormat(language),
    plurals: new Intl.PluralRules(language),
    dates: new Intl.DateTimeFormat(language, { ...dateOptions, weekday: "long", month: "long", day: "numeric" }),
    instants: new Intl.DateTimeFormat(language, { ...instantOptions, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    days: new Intl.DateTimeFormat(language, { ...dayOptions, timeZone: publicPolicy.reportingTimeZone }),
    instantDays: new Intl.DateTimeFormat(language, { ...dayOptions, timeZone }),
    times: new Intl.DateTimeFormat(language, { ...instantOptions, hour: "2-digit", minute: "2-digit" }),
    shortTimes: new Intl.DateTimeFormat(language, { timeZone, calendar: "gregory", hour: "numeric", minute: "2-digit", hourCycle: "h12" }),
    mediumDates: new Intl.DateTimeFormat(language, { ...dateOptions, weekday: "short", month: "short", day: "numeric" }),
    spans: new Intl.DateTimeFormat(language, { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", month: "short", day: "numeric" }),
    months: new Intl.DateTimeFormat(language, { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", month: "long", year: "numeric" }),
    zones: new Intl.DateTimeFormat(language, { ...instantOptions, timeZoneName: "short" }),
  };
  formattersByLocale.set(key, created);
  return created;
}

// Option shapes are code literals; the cap keeps a data-derived shape from growing the map.
const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(language: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${language}|${JSON.stringify(options)}`;
  const existing = numberFormats.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat(language, options);
  if (numberFormats.size < 64) numberFormats.set(key, created);
  return created;
}

// Instants in years 1000–9000 cannot fail getReportingDate's 0001–9999 check, so they skip its
// formatToParts; instants outside keep the full getKickoffDisplayInput validation.
const plainDisplayStart = Date.UTC(1000, 0, 1), plainDisplayEnd = Date.UTC(9000, 0, 1);
function displayInstant(value: UtcInstant): UtcInstant {
  const instant = utcInstantFromEpochMilliseconds(value);
  return instant > plainDisplayStart && instant < plainDisplayEnd ? instant : getKickoffDisplayInput(instant).value;
}

/** Replaces `{name}` placeholders; unknown names stay visible. */
export function fillMessage(message: string, values: Readonly<Record<string, string>>): string {
  return message.replace(/\{(\w+)\}/gu, (placeholder, name: string) => values[name] ?? placeholder);
}

export type TextKey = {
  [Key in keyof typeof catalog]: (typeof catalog)[Key] extends string ? Key : never;
}[keyof typeof catalog];
export type PluralKey = Exclude<keyof typeof catalog, TextKey>;
type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;
export type MessageCatalog = Readonly<Record<TextKey, string> & Record<PluralKey, PluralMessage>>;

export type Messages = ReturnType<typeof buildMessages>;
// The default-catalog helper holds no translations or visitor data, so one frozen instance per
// locale and display zone serves every card, row and label render.
const defaultsByLocale = new Map<string, Messages>();

/** Missing translations fall back per key. Only complete locales may be published. */
export function createMessages(locale?: string, translations?: Partial<MessageCatalog>, timeZone: string = publicPolicy.reportingTimeZone): Messages {
  const language = resolveLocale(locale);
  if (translations) return buildMessages(language, translations, timeZone);
  const key = `${language}|${timeZone}`;
  const existing = defaultsByLocale.get(key);
  if (existing) return existing;
  const created = Object.freeze(buildMessages(language, {}, timeZone));
  defaultsByLocale.set(key, created);
  return created;
}

function buildMessages(language: string, translations: Partial<MessageCatalog>, timeZone: string) {
  const { numbers, plurals, dates, instants, days, instantDays, times, shortTimes, mediumDates, spans, months, zones } = formatters(language, timeZone);
  const zoneName = (value: UtcInstant): string => timeZone === publicPolicy.reportingTimeZone ? "EAT"
    : zones.formatToParts(value).find((part) => part.type === "timeZoneName")!.value;
  const compactReportingDate = (value: ReportingDate) => {
    const parts = mediumDates.formatToParts(getReportingDayBounds(value).startInclusive);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
    const day = part("day").padStart(2, "0"), month = part("month"), year = part("year").padStart(4, "0");
    return { day, month, label: `${day}-${month}-${year}` };
  };

  return {
    text(key: TextKey, values: Readonly<Record<string, string>> = {}): string {
      return fillMessage(translations[key] ?? catalog[key], values);
    },
    plural(key: PluralKey, count: number, values: Readonly<Record<string, string>> = {}): string {
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Count must be a nonnegative safe integer.");
      const message: PluralMessage = translations[key] ?? catalog[key];
      return fillMessage(message[plurals.select(count)] ?? message.other, { ...values, count: numbers.format(count) });
    },
    number(value: number, options?: Intl.NumberFormatOptions): string {
      return (options ? numberFormat(language, options) : numbers).format(value);
    },
    reportingDate(value: ReportingDate): string {
      return dates.format(getReportingDayBounds(value).startInclusive);
    },
    /** Weekday, month and day of an EAT reporting date, for narrow date controls. */
    reportingDateShort(value: ReportingDate): string {
      return days.format(getReportingDayBounds(value).startInclusive);
    },
    /** Short weekday, short month and day of month of an EAT reporting date, for one-day date buttons. */
    reportingDayParts(value: ReportingDate): { weekday: string; month: string; day: string } {
      const parts = days.formatToParts(getReportingDayBounds(value).startInclusive);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
      return { weekday: part("weekday"), month: part("month"), day: part("day") };
    },
    /** Month and year of an EAT reporting date, for calendar headings. */
    reportingMonth(value: ReportingDate): string {
      return months.format(getReportingDayBounds(value).startInclusive);
    },
    /** Month and day of one EAT reporting date or an inclusive range, such as "Oct 14 – 20". */
    reportingDateSpan(from: ReportingDate, to: ReportingDate): string {
      const start = spans.format(getReportingDayBounds(from).startInclusive);
      if (from === to) return start;
      // formatRange spacing differs between the server's and browsers' ICU data, which breaks hydration; join it here.
      const end = getReportingDayBounds(to).startInclusive;
      return fillMessage(translations["feed.date.rangeLabel"] ?? en["feed.date.rangeLabel"], { from: start,
        to: from.slice(0, 7) === to.slice(0, 7) ? spans.formatToParts(end).find((part) => part.type === "day")?.value ?? "" : spans.format(end) });
    },
    /** Compact EAT reporting date with weekday and year, for date controls. */
    reportingDateMedium(value: ReportingDate): string {
      return mediumDates.format(getReportingDayBounds(value).startInclusive);
    },
    /** Reporting dates stay on their named civil day, independently of the display clock. */
    reportingDateRangeCompact(from: ReportingDate, to: ReportingDate): string {
      const start = compactReportingDate(from);
      if (from === to) return start.label;
      const end = compactReportingDate(to);
      if (from.slice(0, 7) === to.slice(0, 7)) return `${start.day}–${end.label}`;
      const first = from.slice(0, 4) === to.slice(0, 4) ? `${start.day}-${start.month}` : start.label;
      return `${first} – ${end.label}`;
    },
    reportingInstant(value: UtcInstant): string {
      const instant = displayInstant(value);
      return `${instants.format(instant)} ${zoneName(instant)}`;
    },
    /** Stable compact date and 24-hour time for performance headings. */
    reportingInstantCompact(value: UtcInstant): string {
      const instant = displayInstant(value), parts = instants.formatToParts(instant);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
      return `${part("day").padStart(2, "0")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")} ${zoneName(instant)}`;
    },
    /** Compact kickoff parts in the display zone; date-only reporting labels keep their named day. */
    reportingDay(value: UtcInstant): string {
      return instantDays.format(displayInstant(value));
    },
    reportingTime(value: UtcInstant): string {
      return times.format(displayInstant(value));
    },
    /** Day first with a short month and optional year, in the kickoff clock's display zone. */
    shortKickoffDate(value: UtcInstant, includeYear = false): string {
      const parts = (includeYear ? instants : instantDays).formatToParts(displayInstant(value));
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
      return `${part("day")}-${part("month")}${includeYear ? `-${part("year")}` : ""}`;
    },
    /** Compact 12-hour kickoff, with an explicit uppercase AM/PM frame. */
    shortKickoffTime(value: UtcInstant): string {
      const parts = shortTimes.formatToParts(displayInstant(value));
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
      return `${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
    },
    /** The zone label at this instant, including its daylight-saving offset. */
    timeZone(value: UtcInstant): string {
      return zoneName(displayInstant(value));
    },
  };
}
