import { addReportingDays, getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds, type ReportingDate } from "./calendar.ts";
import { dateTimeIntervalRange, type DateTimeInterval } from "./date-time.ts";
import { publicPolicy } from "./public-policy.ts";

export const bestSlipPublicationIntervalMs = 30 * 60_000;
export const bestSlipKickoffBufferMs = 30 * 60_000;
export const bestSlipMaximumKickoffSpanMs = 30 * 60_000;
export const bestSlipPreferredKickoffWindowMs = 6 * 3_600_000;
export const bestSlipAppendBatchSize = 32;

export function bestSlipKickoffSpanMs(selections: readonly Readonly<{ kickoffAt: number }>[]): number {
  if (selections.length < 2) return 0;
  let earliest = selections[0]!.kickoffAt, latest = earliest;
  for (const { kickoffAt } of selections) {
    earliest = Math.min(earliest, kickoffAt);
    latest = Math.max(latest, kickoffAt);
  }
  return latest - earliest;
}

/** Feed intervals use inclusive local minutes. The last minute ends at 03:00 exactly. */
export function bestSlipFixtureInterval(day: ReportingDate): DateTimeInterval {
  return { from: `${day}T03:00`, to: `${addReportingDays(day, 1)}T02:59` };
}

export function bestSlipFixtureWindow(day: ReportingDate) {
  return dateTimeIntervalRange(bestSlipFixtureInterval(day), publicPolicy.reportingTimeZone, 2).window;
}

/** A new set begins at midnight. The preceding set has a final window until 03:00. */
export function bestSlipActivePublicationDays(value: number): readonly ReportingDate[] {
  const at = utcInstantFromEpochMilliseconds(value), day = getReportingDate(at);
  return at < bestSlipFixtureWindow(day).startInclusive ? [addReportingDays(day, -1), day] : [day];
}

/** Derive the slot from Kampala's reporting day. `hourAt` is the existing batch key. */
export function bestSlipPublicationHour(value: number) {
  const at = utcInstantFromEpochMilliseconds(value), day = getReportingDate(at);
  const { startInclusive, endExclusive } = getReportingDayBounds(day);
  const hourAt = utcInstantFromEpochMilliseconds(startInclusive + Math.floor((at - startInclusive) / bestSlipPublicationIntervalMs) * bestSlipPublicationIntervalMs);
  return { day, hourAt, nextAt: utcInstantFromEpochMilliseconds(Math.min(hourAt + bestSlipPublicationIntervalMs, endExclusive)) };
}
