import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "./calendar.ts";

const hourMs = 3_600_000;

/** Derive the slot from Kampala's reporting day, independently of the host clock zone. */
export function bestSlipPublicationHour(value: number) {
  const at = utcInstantFromEpochMilliseconds(value), day = getReportingDate(at);
  const { startInclusive, endExclusive } = getReportingDayBounds(day);
  const hourAt = utcInstantFromEpochMilliseconds(startInclusive + Math.floor((at - startInclusive) / hourMs) * hourMs);
  return { day, hourAt, nextAt: utcInstantFromEpochMilliseconds(Math.min(hourAt + hourMs, endExclusive)) };
}
