import { isInWindow, parseReportingDate, type InstantWindow, type UtcInstant } from "./calendar.ts";
import { getDayBoundsInTimeZone } from "./device-calendar.ts";
import { resolveFeedDates } from "./feed-query.ts";

export const novemberReplayZone = "Africa/Kampala";
const firstDate = parseReportingDate("2026-11-01");
const lastDate = parseReportingDate("2026-11-30");
const nextDate = parseReportingDate("2026-12-01");

export const novemberReplayRange = resolveFeedDates({
  dates: { kind: "range", from: firstDate, to: lastDate }, zone: novemberReplayZone,
}, firstDate);
if (novemberReplayRange.window.startInclusive !== getDayBoundsInTimeZone(firstDate, novemberReplayZone).startInclusive ||
    novemberReplayRange.window.endExclusive !== getDayBoundsInTimeZone(nextDate, novemberReplayZone).startInclusive) {
  throw new Error("The November replay window differs from the Matches browsing window.");
}

export function overlapsNovemberReplay(window: InstantWindow): boolean {
  return window.startInclusive < novemberReplayRange.window.endExclusive &&
    window.endExclusive > novemberReplayRange.window.startInclusive;
}

export function isNovemberReplayKickoff(kickoffAt: UtcInstant | null): boolean {
  return kickoffAt !== null && isInWindow(kickoffAt, novemberReplayRange.window);
}
