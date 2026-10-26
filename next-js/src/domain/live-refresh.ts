import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds, type ReportingDate } from "./calendar.ts";
import { getDateInTimeZone, getDayBoundsInTimeZone } from "./device-calendar.ts";
import { FeedPaginationError } from "./feed-pagination-error.ts";
import { fixtureAdvance, mergeFixtureObservation } from "./fixture-reconciliation.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import { fullDetailSnapshot } from "./detail-snapshot.ts";
import type { MatchFeedResponse } from "./match-feed.ts";
import type { LiveMatchSnapshot } from "./live-match.ts";

export const liveRefreshRules = Object.freeze({ activeMs: 20_000, quietMs: 60_000, timeoutMs: 30_000, kickoffLeadMs: 30 * 60_000 });

/** Fast polling only while something can change soon: an updating run, a live match or a scheduled
 * kickoff within the lead either side of now. Other views, relative dates included, poll quietly;
 * the loop still wakes at the view's calendar midnight. */
export function feedRefreshInterval(data: Pick<MatchFeedResponse, "run">,
  records: readonly Pick<MatchFeedResponse["records"][number], "status" | "kickoffAt">[], now: number): number {
  const active = data.run?.phase === "updating" || records.some((record) => record.status === "live" ||
    record.status === "scheduled" && record.kickoffAt !== null && Math.abs(record.kickoffAt - now) <= liveRefreshRules.kickoffLeadMs);
  return active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs;
}

export function acceptRun(previous: MatchFeedResponse["run"], next: MatchFeedResponse["run"], today?: string) {
  if (!previous || next === null && today !== undefined && today > previous.date) return next;
  if (!next || next.date < previous.date || next.date === previous.date && previous.sequence !== null &&
      (next.sequence === null || BigInt(next.sequence) < BigInt(previous.sequence))) throw new FeedPaginationError("stale-data");
  return next;
}

/** Historical inspection is a separate server-rendered tree, never refresh input. */
export function mergeLiveDetail(previous: MatchDetailResponse, next: MatchDetailResponse): MatchDetailResponse {
  if (next.selection !== "applicable" || previous.selection !== "applicable" || next.snapshot?.historical ||
      next.fixture.fixtureId !== previous.fixture.fixtureId) throw new FeedPaginationError("invalid-response");
  // Permission withdrawal wins even when the shared raw cache has an older observation clock.
  if (previous.access.tier === "full" && next.access.tier === "free") return next;
  if (next.asOf < previous.asOf || fixtureAdvance(previous.fixture, next.fixture) < 0) throw new FeedPaginationError("stale-data");
  acceptRun(previous.run, next.run, getReportingDate(next.asOf));
  if (next.access.tier !== previous.access.tier || next.access.signedIn !== previous.access.signedIn) return next;
  const liveMatch = mergeLiveMatchObservation(previous.liveMatch, next.liveMatch);
  const liveEnvelope = "liveMatch" in previous || "liveMatch" in next ? { liveMatch } : {};
  const oldSnapshot = fullDetailSnapshot(previous), newSnapshot = fullDetailSnapshot(next);
  if (!!oldSnapshot !== !!newSnapshot) return liveMatch === next.liveMatch ? next : { ...next, liveMatch };
  if (oldSnapshot && newSnapshot && newSnapshot.cycleId === oldSnapshot.cycleId &&
      (BigInt(newSnapshot.runSequence) < BigInt(oldSnapshot.runSequence) || newSnapshot.fixtureRevision < oldSnapshot.fixtureRevision)) {
    throw new FeedPaginationError("stale-data");
  }
  if (next.fixture.dataVersion === previous.fixture.dataVersion) {
    // A permission-expired response may withdraw analysis without a publication.
    const snapshot = oldSnapshot && newSnapshot
      ? newSnapshot.revisionId === oldSnapshot.revisionId && oldSnapshot.analysis.state === "available" && newSnapshot.analysis.state === "withheld"
        ? { ...oldSnapshot, analysis: newSnapshot.analysis } : oldSnapshot
      : next.snapshot;
    // Odds groups (052) are observation data outside the revision: take the newer envelope's groups.
    return { ...previous, fixture: mergeFixtureObservation(previous.fixture, next.fixture), snapshot, asOf: next.asOf, run: next.run,
      ...(next.odds === undefined ? {} : { odds: next.odds }), ...liveEnvelope };
  }
  return liveMatch === next.liveMatch ? next : { ...next, liveMatch };
}

/** A late detail response cannot replace a newer stored observation of the same occurrence. */
function mergeLiveMatchObservation(previous: LiveMatchSnapshot | null | undefined, next: LiveMatchSnapshot | null | undefined) {
  if (!previous || !next || previous.cycleId !== next.cycleId || previous.kickoffAt !== next.kickoffAt) return next;
  return next.collectedAt < previous.collectedAt ? previous : next;
}

export type RefreshEnvironment = Readonly<{
  now(): number; available(): boolean; schedule(callback: () => void, delay: number): unknown; cancel(timer: unknown): void;
  listen(callback: () => void): () => void;
}>;

/** One serial loop per visible view; lifecycle changes cancel obsolete work. */
export function startLiveRefresh(options: {
  today: ReportingDate; zone?: string | null; interval(): number; refresh(): Promise<unknown>; rollover(today: ReportingDate): void;
}, environment: RefreshEnvironment) {
  let stopped = false, running = false, timer: unknown, day = options.today;
  const dateAt = (now: number) => {
    const instant = utcInstantFromEpochMilliseconds(now);
    return options.zone ? getDateInTimeZone(instant, options.zone) : getReportingDate(instant);
  };
  const arm = () => {
    environment.cancel(timer);
    if (stopped || !environment.available()) return;
    const now = utcInstantFromEpochMilliseconds(environment.now());
    const date = dateAt(now);
    const untilMidnight = (options.zone ? getDayBoundsInTimeZone(date, options.zone) : getReportingDayBounds(date)).endExclusive - now;
    timer = environment.schedule(() => { void tick(); }, Math.min(options.interval(), untilMidnight));
  };
  const tick = async () => {
    environment.cancel(timer);
    if (stopped || running || !environment.available()) return;
    const nextDay = dateAt(environment.now());
    if (nextDay > day) { day = nextDay; options.rollover(day); arm(); return; }
    running = true;
    try { await options.refresh(); } catch { /* The view owns its retained-data error. */ } finally { running = false; arm(); }
  };
  const unlisten = environment.listen(() => { if (environment.available()) void tick(); else environment.cancel(timer); });
  // Check the selected calendar's rollover without fetching a duplicate initial page.
  const current = dateAt(environment.now());
  if (current > day) { day = current; options.rollover(day); }
  arm();
  return () => { stopped = true; environment.cancel(timer); unlisten(); };
}
