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

export function resolveReplayRange(from: string, to: string) {
  const first = parseReportingDate(from), last = parseReportingDate(to);
  if (first > last) throw new RangeError("The replay start date must precede its end date.");
  return resolveFeedDates({ dates: { kind: "range", from: first, to: last }, zone: novemberReplayZone }, first);
}

/** An exclusive lock exactly one millisecond later describes the same evidence window. */
export function inclusiveReplayEvidenceCutoff(exclusiveCutoffAt: number | null, decisionAt: number | null | undefined) {
  return decisionAt != null && exclusiveCutoffAt === decisionAt + 1 ? decisionAt : exclusiveCutoffAt;
}

export function replaySuppressionClocks(previousCutoffAt: number, attemptedDecisionAt: number | null | undefined) {
  const decisionAt = attemptedDecisionAt ?? previousCutoffAt;
  const evidenceCutoffAt = inclusiveReplayEvidenceCutoff(previousCutoffAt, decisionAt);
  return evidenceCutoffAt === null || evidenceCutoffAt > decisionAt ? null : { decisionAt, evidenceCutoffAt };
}

export function overlapsNovemberReplay(window: InstantWindow): boolean {
  return window.startInclusive < novemberReplayRange.window.endExclusive &&
    window.endExclusive > novemberReplayRange.window.startInclusive;
}

export function isNovemberReplayKickoff(kickoffAt: UtcInstant | null): boolean {
  return kickoffAt !== null && isInWindow(kickoffAt, novemberReplayRange.window);
}
