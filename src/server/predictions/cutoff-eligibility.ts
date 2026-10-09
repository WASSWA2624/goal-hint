import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { StoredCycle, StoredRevision } from "./history-contract.ts";
import { cutoffFail, type CutoffSchedule } from "./cutoff-contract.ts";
import { revisionEligibleForSchedule } from "./publication-eligibility.ts";

/** Reconstruct the first deadline reached while its schedule was in force.
 * A later correction cannot undo a deadline already reached during downtime. */
export function reconstructCutoff(cycle: StoredCycle, schedules: readonly CutoffSchedule[], now: UtcInstant, earlyAt: UtcInstant | null) {
  if (schedules.length !== cycle.scheduleVersion) return cutoffFail("unavailable");
  let deadline = cycle.cutoffAt, reason = "scheduled-cutoff";
  for (let index = 0; index < schedules.length; index++) {
    const row = schedules[index]!, next = schedules[index + 1];
    if (row.version !== index + 1 || row.cutoffAt !== getPublicationDeadline(row.kickoffAt) || row.observedAt > now ||
      row.actualStartedAt !== null && row.actualStartedAt > row.observedAt || next && next.observedAt < row.observedAt)
      return cutoffFail("unavailable");
    if (row.cutoffAt <= (next?.observedAt ?? now) && row.cutoffAt < deadline) {
      deadline = row.cutoffAt; reason = "schedule-history-cutoff";
    }
    if (row.actualStartedAt !== null) earlyAt = earlyAt === null ? row.actualStartedAt : Math.min(earlyAt, row.actualStartedAt) as UtcInstant;
  }
  const latest = schedules.at(-1)!;
  if (latest.kickoffAt !== cycle.kickoffAt || latest.cutoffAt !== cycle.cutoffAt) return cutoffFail("unavailable");
  if (earlyAt !== null && earlyAt < deadline) { deadline = earlyAt; reason = "early-play"; }
  return Object.freeze({ effectiveCloseAt: utcInstantFromEpochMilliseconds(deadline), reason, due: now >= deadline });
}
export function revisionEligibleForLock(revision: StoredRevision, cycle: StoredCycle,
  schedules: readonly CutoffSchedule[], effectiveCloseAt: UtcInstant): boolean {
  const schedule = schedules[revision.scheduleVersion - 1];
  const nextSchedule = schedules[revision.scheduleVersion];
  return revisionEligibleForSchedule(revision, cycle, effectiveCloseAt) && schedule !== undefined &&
    revision.candidate.context.context.kickoffAt === schedule.kickoffAt &&
    revision.publishedAt >= schedule.observedAt && revision.publishedAt < schedule.cutoffAt &&
    (nextSchedule === undefined || revision.publishedAt <= nextSchedule.observedAt);
}
