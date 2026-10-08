import { publicPolicy } from "./public-policy.ts";

declare const reportingDateBrand: unique symbol;
declare const utcInstantBrand: unique symbol;

/** Gregorian YYYY-MM-DD, with years 0001 through 9999. */
export type ReportingDate = string & { readonly [reportingDateBrand]: true };
/** Integer Unix epoch milliseconds; never a mutable Date or host-local value. */
export type UtcInstant = number & { readonly [utcInstantBrand]: true };
export type Clock = Readonly<{ now(): UtcInstant }>;

export const calendarRules = Object.freeze({
  storedTimeZone: "UTC",
  dailyRunTime: "00:00",
  dailyRunUtcCron: "0 21 * * *",
  windowDays: publicPolicy.predictionWindowDays,
  cutoffSecondsBeforeKickoff: 300,
  publicationStrictlyBeforeCutoff: true,
  observedPlayClosesPublication: true,
} as const);

export type InstantWindow = Readonly<{
  startInclusive: UtcInstant;
  endExclusive: UtcInstant;
}>;

export type PredictionWindow = InstantWindow & Readonly<{
  runDate: ReportingDate;
  lastDate: ReportingDate;
  endDateExclusive: ReportingDate;
}>;

export type ReportingDateRange = Readonly<{
  startDate: ReportingDate;
  endDate: ReportingDate;
  dayCount: number;
  window: InstantWindow;
}>;

export type PublicationInput = Readonly<{
  scheduledKickoff: UtcInstant;
  originalWindow: PredictionWindow;
  isOriginalManifestMember: boolean;
  earlierCloseAt?: UtcInstant;
}>;

export class CalendarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarValidationError";
  }
}

const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8_640_000_000_000_000;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const instantPattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const reportingFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: publicPolicy.reportingTimeZone,
  calendar: "gregory",
  numberingSystem: "latn",
  era: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// setUTCFullYear avoids Date.UTC's special handling of years 0 through 99.
function gregorianDay(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / DAY_MS;
}

function dateDay(value: ReportingDate): number {
  const date = parseReportingDate(value);
  return gregorianDay(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8)));
}

function reportingParts(instant: UtcInstant) {
  const parts = reportingFormatter.formatToParts(utcInstantFromEpochMilliseconds(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (value === undefined) throw new CalendarValidationError("Reporting date cannot be resolved.");
    return value;
  };
  const year = Number(part("year"));
  return {
    year: part("era") === "AD" ? year : 1 - year,
    month: Number(part("month")),
    day: Number(part("day")),
  };
}

function reportingDay(instant: UtcInstant): number {
  const { year, month, day } = reportingParts(instant);
  return gregorianDay(year, month, day);
}

/** First instant of a named Kampala day, including historical timezone changes. */
function startOfDay(day: number): UtcInstant {
  // Search by local date rather than assuming every Kampala day has 24 hours
  // or that historical offsets equal today's UTC+03:00. Never read host time.
  let lower = day * DAY_MS - DAY_MS;
  let upper = day * DAY_MS + DAY_MS;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (reportingDay(utcInstantFromEpochMilliseconds(middle)) < day) lower = middle + 1;
    else upper = middle;
  }
  const start = utcInstantFromEpochMilliseconds(lower);
  if (reportingDay(start) !== day) {
    throw new CalendarValidationError("Reporting day does not exist in the reporting timezone.");
  }
  return start;
}

export function parseReportingDate(value: unknown): ReportingDate {
  if (typeof value !== "string" || value.length !== 10 || !datePattern.test(value)) {
    throw new CalendarValidationError("Reporting date must use YYYY-MM-DD.");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const parsed = new Date(gregorianDay(year, month, day) * DAY_MS);
  if (year < 1 || parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new CalendarValidationError("Reporting date must be a real Gregorian date in years 0001–9999.");
  }
  return value as ReportingDate;
}

export function addReportingDays(value: ReportingDate, days: number): ReportingDate {
  if (!Number.isSafeInteger(days)) {
    throw new CalendarValidationError("Date increment must be a safe integer number of days.");
  }
  const result = new Date((dateDay(value) + days) * DAY_MS);
  if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999) {
    throw new CalendarValidationError("Date increment exceeds the supported reporting years.");
  }
  return parseReportingDate(result.toISOString().slice(0, 10));
}

export function utcInstantFromEpochMilliseconds(value: number): UtcInstant {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_DATE_MS) {
    throw new CalendarValidationError("UTC instant must be valid integer epoch milliseconds.");
  }
  return value as UtcInstant;
}

export function utcInstantFromDate(value: Date): UtcInstant {
  return utcInstantFromEpochMilliseconds(value.getTime());
}

/** Accept explicit UTC seconds with at most millisecond precision; no normalization. */
export function parseUtcInstant(value: unknown): UtcInstant {
  const match = typeof value === "string" ? instantPattern.exec(value) : null;
  if (!match || match[0] !== value) {
    throw new CalendarValidationError("UTC instant must use YYYY-MM-DDTHH:mm:ss[.SSS]Z.");
  }
  const date = parseReportingDate(match[1]);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new CalendarValidationError("UTC instant contains an invalid time.");
  }
  const milliseconds = Number((match[5] ?? "").padEnd(3, "0"));
  return utcInstantFromEpochMilliseconds(
    dateDay(date) * DAY_MS + hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + milliseconds,
  );
}

export function toUtcIsoString(value: UtcInstant): string {
  return new Date(utcInstantFromEpochMilliseconds(value)).toISOString();
}

export function getReportingDate(value: UtcInstant): ReportingDate {
  const { year, month, day } = reportingParts(value);
  if (year < 1 || year > 9999) {
    throw new CalendarValidationError("Instant is outside the supported reporting years.");
  }
  return parseReportingDate(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}

export function getReportingDayBounds(value: ReportingDate): InstantWindow {
  const day = dateDay(value);
  return Object.freeze({ startInclusive: startOfDay(day), endExclusive: startOfDay(day + 1) });
}

export function createPredictionWindow(runDate: ReportingDate): PredictionWindow {
  const date = parseReportingDate(runDate);
  const endDateExclusive = addReportingDays(date, calendarRules.windowDays);
  return Object.freeze({
    runDate: date,
    lastDate: addReportingDays(endDateExclusive, -1),
    endDateExclusive,
    startInclusive: startOfDay(dateDay(date)),
    endExclusive: startOfDay(dateDay(endDateExclusive)),
  });
}

export function isInWindow(value: UtcInstant, window: InstantWindow): boolean {
  const instant = utcInstantFromEpochMilliseconds(value);
  const start = utcInstantFromEpochMilliseconds(window.startInclusive);
  const end = utcInstantFromEpochMilliseconds(window.endExclusive);
  if (start >= end) throw new CalendarValidationError("Instant window must be increasing and bounded.");
  return instant >= start && instant < end;
}

/** Inclusive query dates, independent of the prediction window. Callers own the cap. */
export function validateReportingDateRange(
  startDate: unknown,
  endDate: unknown,
  maximumDays: number,
): ReportingDateRange {
  if (!Number.isSafeInteger(maximumDays) || maximumDays < 1) {
    throw new CalendarValidationError("Query range requires a positive finite integer day limit.");
  }
  const start = parseReportingDate(startDate);
  const end = parseReportingDate(endDate);
  const startDay = dateDay(start);
  const endDay = dateDay(end);
  const dayCount = endDay - startDay + 1;
  if (dayCount < 1 || dayCount > maximumDays) {
    throw new CalendarValidationError("Query range is inverted or exceeds its day limit.");
  }
  return Object.freeze({
    startDate: start,
    endDate: end,
    dayCount,
    window: Object.freeze({ startInclusive: startOfDay(startDay), endExclusive: startOfDay(endDay + 1) }),
  });
}

export function getPublicationDeadline(
  scheduledKickoff: UtcInstant,
  earlierCloseAt?: UtcInstant,
): UtcInstant {
  const standardCutoff = utcInstantFromEpochMilliseconds(
    utcInstantFromEpochMilliseconds(scheduledKickoff) - calendarRules.cutoffSecondsBeforeKickoff * 1_000,
  );
  return earlierCloseAt === undefined ? standardCutoff : utcInstantFromEpochMilliseconds(
    Math.min(standardCutoff, utcInstantFromEpochMilliseconds(earlierCloseAt)),
  );
}

export function isBeforePublicationCutoff(
  publishedAt: UtcInstant,
  scheduledKickoff: UtcInstant,
  earlierCloseAt?: UtcInstant,
): boolean {
  return utcInstantFromEpochMilliseconds(publishedAt) < getPublicationDeadline(scheduledKickoff, earlierCloseAt);
}

/** Temporal eligibility only; later services must also verify status, cycle and run order. */
export function isEligibleForPrediction(
  scheduledKickoff: UtcInstant,
  originalWindow: PredictionWindow,
  currentWindow: PredictionWindow,
  isOriginalManifestMember: boolean,
): boolean {
  return isOriginalManifestMember === true &&
    isInWindow(scheduledKickoff, originalWindow) && isInWindow(scheduledKickoff, currentWindow);
}

export function isTemporallyEligibleForPublication(
  publishedAt: UtcInstant,
  input: PublicationInput,
): boolean {
  const currentWindow = createPredictionWindow(getReportingDate(publishedAt));
  return isEligibleForPrediction(
    input.scheduledKickoff, input.originalWindow, currentWindow, input.isOriginalManifestMember,
  ) && isBeforePublicationCutoff(publishedAt, input.scheduledKickoff, input.earlierCloseAt);
}

/** Clock is mandatory. Each decision captures exactly one instant. */
export function createCalendar(clock: Clock) {
  return Object.freeze({
    currentWindow(): PredictionWindow {
      return createPredictionWindow(getReportingDate(clock.now()));
    },
    canPublish(input: PublicationInput): boolean {
      return isTemporallyEligibleForPublication(clock.now(), input);
    },
  });
}

/** Locale selection/labels belong to UI; visitor timezone affects this display only. */
export function getKickoffDisplayInput(kickoff: UtcInstant, visitorTimeZone?: string) {
  const value = utcInstantFromEpochMilliseconds(kickoff);
  let timeZone = publicPolicy.reportingTimeZone as string;
  if (visitorTimeZone !== undefined) {
    if (typeof visitorTimeZone !== "string" || visitorTimeZone.length === 0) {
      throw new CalendarValidationError("Display timezone must be an explicit Intl timezone.");
    }
    try {
      timeZone = new Intl.DateTimeFormat("en-US", { timeZone: visitorTimeZone }).resolvedOptions().timeZone;
    } catch {
      throw new CalendarValidationError("Display timezone must be an explicit Intl timezone.");
    }
  }
  return Object.freeze({
    value,
    reportingDate: getReportingDate(value),
    timeZone,
    options: Object.freeze({
      timeZone,
      calendar: "gregory",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    } satisfies Intl.DateTimeFormatOptions),
  });
}
