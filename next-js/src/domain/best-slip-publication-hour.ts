import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "./calendar.ts";

export const bestSlipPublicationIntervalMs = 30 * 60_000;
export const bestSlipKickoffBufferMs = 30 * 60_000;
export const bestSlipPreferredKickoffWindowMs = 6 * 3_600_000;

/** Derive the slot from Kampala's reporting day. `hourAt` is the existing batch key. */
export function bestSlipPublicationHour(value: number) {
  const at = utcInstantFromEpochMilliseconds(value), day = getReportingDate(at);
  const { startInclusive, endExclusive } = getReportingDayBounds(day);
  const hourAt = utcInstantFromEpochMilliseconds(startInclusive + Math.floor((at - startInclusive) / bestSlipPublicationIntervalMs) * bestSlipPublicationIntervalMs);
  return { day, hourAt, nextAt: utcInstantFromEpochMilliseconds(Math.min(hourAt + bestSlipPublicationIntervalMs, endExclusive)) };
}
