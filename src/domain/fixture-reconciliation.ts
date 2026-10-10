import { compareFixtureVersions, type FixtureSnapshot } from "./fixture-snapshot.ts";

/** Versions order whole snapshots; cycle/reference checks also reject malformed regressions. */
export function fixtureAdvance(previous: FixtureSnapshot, next: FixtureSnapshot): -1 | 0 | 1 {
  if (next.fixtureId !== previous.fixtureId) throw new RangeError("Fixture identity changed.");
  const order = compareFixtureVersions(next.dataVersion, previous.dataVersion);
  if (order <= 0) return order;
  const oldCycle = previous.cycle, cycle = next.cycle;
  if (oldCycle && (!cycle || cycle.ordinal < oldCycle.ordinal || cycle.ordinal === oldCycle.ordinal && next.cycleId !== previous.cycleId)) return -1;
  if (next.cycleId === previous.cycleId && oldCycle && cycle) {
    if (oldCycle.state === "void" && cycle.state !== "void" || oldCycle.state === "closed" && cycle.state === "open") return -1;
    if (oldCycle.state === "closed" && previous.forecast?.revisionId !== next.forecast?.revisionId) return -1;
    if (previous.forecast && (!next.forecast || next.forecast.publishedAt < previous.forecast.publishedAt)) return -1;
    const sequence = previous.forecast?.runSequence, incoming = next.forecast?.runSequence;
    if (sequence && (!incoming || BigInt(incoming) < BigInt(sequence) || incoming === sequence &&
        next.forecast?.revisionId !== previous.forecast?.revisionId)) return -1;
  }
  return order;
}

/** Observation/job metadata can change without a material fixture-version bump.
 * Its enclosing read clock is checked by the caller; forecast content stays atomic. */
export function mergeFixtureObservation<T extends FixtureSnapshot>(previous: T, next: T): T {
  if (next.cycleId !== previous.cycleId || next.forecast?.revisionId !== previous.forecast?.revisionId ||
      next.forecast?.runId !== previous.forecast?.runId) return previous;
  return { ...previous, syncedAt: next.syncedAt !== null && (previous.syncedAt === null || next.syncedAt >= previous.syncedAt)
    ? next.syncedAt : previous.syncedAt, partialCoverage: next.partialCoverage, update: next.update,
    availabilityMessage: next.availabilityMessage,
    forecast: previous.forecast && { ...previous.forecast, updateDelayed: next.forecast?.updateDelayed } };
}
