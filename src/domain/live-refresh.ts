import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds, type ReportingDate } from "./calendar.ts";
import { FeedPaginationError } from "./feed-pagination.ts";
import { fixtureAdvance, mergeFixtureObservation } from "./fixture-reconciliation.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import type { MatchFeedResponse } from "./match-feed.ts";

export const liveRefreshRules = Object.freeze({ activeMs: 20_000, quietMs: 60_000, timeoutMs: 30_000, kickoffLeadMs: 30 * 60_000 });

/** Fast polling only while something can change soon: an updating run, a live match or a scheduled
 * kickoff within the lead either side of now. Other views, relative dates included, poll quietly;
 * the loop still wakes at EAT midnight. */
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
  if (next.asOf < previous.asOf || fixtureAdvance(previous.fixture, next.fixture) < 0) throw new FeedPaginationError("stale-data");
  acceptRun(previous.run, next.run, getReportingDate(next.asOf));
  if (previous.snapshot && next.snapshot && next.snapshot.cycleId === previous.snapshot.cycleId &&
      (BigInt(next.snapshot.runSequence) < BigInt(previous.snapshot.runSequence) || next.snapshot.fixtureRevision < previous.snapshot.fixtureRevision)) {
    throw new FeedPaginationError("stale-data");
  }
  if (next.fixture.dataVersion === previous.fixture.dataVersion) {
    // A permission-expired response may withdraw analysis without a publication.
    const snapshot = previous.snapshot && next.snapshot?.revisionId === previous.snapshot.revisionId &&
      previous.snapshot.analysis.state === "available" && next.snapshot.analysis.state === "withheld"
      ? { ...previous.snapshot, analysis: next.snapshot.analysis } : previous.snapshot;
    return { ...previous, fixture: mergeFixtureObservation(previous.fixture, next.fixture), snapshot, asOf: next.asOf, run: next.run };
  }
  return next;
}

export type RefreshEnvironment = Readonly<{
  now(): number; available(): boolean; schedule(callback: () => void, delay: number): unknown; cancel(timer: unknown): void;
  listen(callback: () => void): () => void;
}>;

/** One serial loop per visible view; lifecycle changes cancel obsolete work. */
export function startLiveRefresh(options: {
  today: ReportingDate; interval(): number; refresh(): Promise<unknown>; rollover(today: ReportingDate): void;
}, environment: RefreshEnvironment) {
  let stopped = false, running = false, timer: unknown, day = options.today;
  const arm = () => {
    environment.cancel(timer);
    if (stopped || !environment.available()) return;
    const now = utcInstantFromEpochMilliseconds(environment.now());
    const untilMidnight = getReportingDayBounds(getReportingDate(now)).endExclusive - now;
    timer = environment.schedule(() => { void tick(); }, Math.min(options.interval(), untilMidnight));
  };
  const tick = async () => {
    environment.cancel(timer);
    if (stopped || running || !environment.available()) return;
    const nextDay = getReportingDate(utcInstantFromEpochMilliseconds(environment.now()));
    if (nextDay > day) { day = nextDay; options.rollover(day); arm(); return; }
    running = true;
    try { await options.refresh(); } catch { /* The view owns its retained-data error. */ } finally { running = false; arm(); }
  };
  const unlisten = environment.listen(() => { if (environment.available()) void tick(); else environment.cancel(timer); });
  // Check reporting rollover without fetching a duplicate initial page.
  const current = getReportingDate(utcInstantFromEpochMilliseconds(environment.now()));
  if (current > day) { day = current; options.rollover(day); }
  arm();
  return () => { stopped = true; environment.cancel(timer); unlisten(); };
}
