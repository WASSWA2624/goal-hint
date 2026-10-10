import { getKickoffDisplayInput, getReportingDayBounds, utcInstantFromEpochMilliseconds, type ReportingDate, type UtcInstant } from "../domain/calendar.ts";
import { publicPolicy } from "../domain/public-policy.ts";
import { resolveLocale } from "./locales.ts";
import { en } from "./messages/en.ts";

type Formatters = { numbers: Intl.NumberFormat; plurals: Intl.PluralRules; dates: Intl.DateTimeFormat; instants: Intl.DateTimeFormat;
  days: Intl.DateTimeFormat; times: Intl.DateTimeFormat; mediumDates: Intl.DateTimeFormat };
// Immutable formatters are shared by locale; translations and visitor data are never cached.
const formattersByLocale = new Map<string, Formatters>();
function formatters(language: string): Formatters {
  const existing = formattersByLocale.get(language);
  if (existing) return existing;
  const dateOptions = { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", year: "numeric" } as const;
  const created: Formatters = {
    numbers: new Intl.NumberFormat(language),
    plurals: new Intl.PluralRules(language),
    dates: new Intl.DateTimeFormat(language, { ...dateOptions, weekday: "long", month: "long", day: "numeric" }),
    instants: new Intl.DateTimeFormat(language, { ...dateOptions, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    days: new Intl.DateTimeFormat(language, { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", weekday: "short", month: "short", day: "numeric" }),
    times: new Intl.DateTimeFormat(language, { timeZone: publicPolicy.reportingTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    mediumDates: new Intl.DateTimeFormat(language, { ...dateOptions, weekday: "short", month: "short", day: "numeric" }),
  };
  formattersByLocale.set(language, created);
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
  [Key in keyof typeof en]: (typeof en)[Key] extends string ? Key : never;
}[keyof typeof en];
export type PluralKey = Exclude<keyof typeof en, TextKey>;
type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;
export type MessageCatalog = Readonly<Record<TextKey, string> & Record<PluralKey, PluralMessage>>;

export type Messages = ReturnType<typeof buildMessages>;
// The default-catalog helper holds no translations or visitor data, so one frozen instance per
// locale serves every card, row and label render.
const defaultsByLocale = new Map<string, Messages>();

/** Missing translations fall back per key. Only complete locales may be published. */
export function createMessages(locale?: string, translations?: Partial<MessageCatalog>): Messages {
  const language = resolveLocale(locale);
  if (translations) return buildMessages(language, translations);
  const existing = defaultsByLocale.get(language);
  if (existing) return existing;
  const created = Object.freeze(buildMessages(language, {}));
  defaultsByLocale.set(language, created);
  return created;
}

function buildMessages(language: string, translations: Partial<MessageCatalog>) {
  const { numbers, plurals, dates, instants, days, times, mediumDates } = formatters(language);

  return {
    text(key: TextKey, values: Readonly<Record<string, string>> = {}): string {
      return fillMessage(translations[key] ?? en[key], values);
    },
    plural(key: PluralKey, count: number): string {
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Count must be a nonnegative safe integer.");
      const message: PluralMessage = translations[key] ?? en[key];
      return (message[plurals.select(count)] ?? message.other).replaceAll("{count}", numbers.format(count));
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
    /** Compact EAT reporting date with weekday and year, for date controls. */
    reportingDateMedium(value: ReportingDate): string {
      return mediumDates.format(getReportingDayBounds(value).startInclusive);
    },
    reportingInstant(value: UtcInstant): string {
      return instants.format(displayInstant(value)) + " EAT";
    },
    /** Compact EAT kickoff parts for cards; full labels remain on reportingInstant. */
    reportingDay(value: UtcInstant): string {
      return days.format(displayInstant(value));
    },
    reportingTime(value: UtcInstant): string {
      return times.format(displayInstant(value));
    },
  };
}
