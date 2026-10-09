import { getReportingDayBounds, type ReportingDate } from "../domain/calendar.ts";
import { publicPolicy } from "../domain/public-policy.ts";
import { resolveLocale } from "./locales.ts";
import { en } from "./messages/en.ts";

export type TextKey = {
  [Key in keyof typeof en]: (typeof en)[Key] extends string ? Key : never;
}[keyof typeof en];
export type PluralKey = Exclude<keyof typeof en, TextKey>;
type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;
export type MessageCatalog = Readonly<Record<TextKey, string> & Record<PluralKey, PluralMessage>>;

/** Missing translations fall back per key. Only complete locales may be published. */
export function createMessages(locale?: string, translations: Partial<MessageCatalog> = {}) {
  const language = resolveLocale(locale);
  const numbers = new Intl.NumberFormat(language);
  const plurals = new Intl.PluralRules(language);
  const dates = new Intl.DateTimeFormat(language, {
    timeZone: publicPolicy.reportingTimeZone,
    calendar: "gregory",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    text(key: TextKey): string {
      return translations[key] ?? en[key];
    },
    plural(key: PluralKey, count: number): string {
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Count must be a nonnegative safe integer.");
      const message: PluralMessage = translations[key] ?? en[key];
      return (message[plurals.select(count)] ?? message.other).replaceAll("{count}", numbers.format(count));
    },
    number(value: number, options?: Intl.NumberFormatOptions): string {
      return options ? new Intl.NumberFormat(language, options).format(value) : numbers.format(value);
    },
    reportingDate(value: ReportingDate): string {
      return dates.format(getReportingDayBounds(value).startInclusive);
    },
  };
}
