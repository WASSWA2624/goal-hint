"use client";

import { useCallback, useSyncExternalStore } from "react";
import styled from "styled-components";
import { ClockIcon } from "@/components/ui/icons";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { liveClockFreshness, liveClockFreshnessMs, liveClockLabel, startConfirmationDeadline } from "@/domain/match-clock";
import type { Messages } from "@/i18n/messages";

/** Larger figures and a wider separator fit inside the existing score slot. */
export const Scoreline = styled.span`
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--gh-font-section); font-weight: ${({ theme }) => theme.typography.weight.bold};
  /* Retain the original 13px × 1.3 line box so compact cards do not grow. */
  line-height: var(--gh-size-4_225); font-variant-numeric: tabular-nums; white-space: nowrap;
  [data-score-separator] { flex: none; inline-size: var(--gh-size-4); text-align: center; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  [data-status="live"] & { color: ${({ theme }) => theme.color.live.text}; }
`;

export function ScoreFigures({ home, away, lead = 0 }: { home: string; away: string; lead?: number }) {
  return <><span data-score-home data-loss={lead < 0 || undefined}>{home}</span>
    <span data-score-separator>–</span><span data-score-away data-loss={lead > 0 || undefined}>{away}</span></>;
}

const clockListeners = new Set<() => void>();
let clockTimer: number | undefined;
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  clockTimer ??= window.setInterval(() => {
    if (document.visibilityState === "visible") clockListeners.forEach((update) => update());
  }, 1000);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}
const subscribeIdle = () => () => {};

function useReachedTime(at: number | null): boolean {
  const subscribe = useCallback((listener: () => void) => {
    if (at === null || Date.now() >= at) return subscribeIdle();
    let timer: number;
    const notify = () => {
      const remaining = at - Date.now();
      if (remaining <= 0) listener();
      else timer = window.setTimeout(notify, Math.min(remaining, 2_147_483_647));
    };
    notify();
    return () => window.clearTimeout(timer);
  }, [at]);
  return useSyncExternalStore(subscribe, () => at !== null && Date.now() >= at, () => false);
}

export function useStartUnconfirmed(status: FixtureSnapshot["status"], kickoffAt: FixtureSnapshot["kickoffAt"] | undefined) {
  return useReachedTime(status === "scheduled" ? startConfirmationDeadline(kickoffAt) : null);
}

const Elapsed = styled.span`font-variant-numeric: tabular-nums; white-space: nowrap;`;

const FreshnessMarker = styled.span`
  position: absolute; inset-block-start: 0; inset-inline-end: 0;
  display: grid; place-items: center; padding: 0;
  inline-size: var(--gh-size-2_5); block-size: var(--gh-size-2_5);
  color: ${({ theme }) => theme.color.accent.orange.text};
  > svg { inline-size: 100%; block-size: 100%; }
`;

export function MatchFreshnessIcon({ reason, label }: {
  reason: "start-unconfirmed" | NonNullable<ReturnType<typeof liveClockFreshness>>; label: string;
}) {
  return <FreshnessMarker data-match-freshness={reason} role="img" aria-label={label} title={label}><ClockIcon /></FreshnessMarker>;
}

/** Only the small clock text subscribes to the shared browser ticker. */
export function LiveMatchTime({ clock, messages, badge = false, resultVerifiedAt }: {
  clock: FixtureSnapshot["liveClock"]; messages: Messages; badge?: boolean; resultVerifiedAt?: FixtureSnapshot["resultVerifiedAt"];
}) {
  const initial = liveClockLabel(clock, messages), field = badge ? "badge" : "visible";
  const changedAt = clock?.observedAt ?? null;
  const verifiedAt = resultVerifiedAt === undefined ? changedAt : resultVerifiedAt;
  const hasMinute = initial.minute !== null;
  const statusDeadline = verifiedAt === null ? null : verifiedAt + liveClockFreshnessMs;
  const clockDeadline = changedAt === null || !hasMinute ? null : changedAt + liveClockFreshnessMs;
  const statusStale = useReachedTime(statusDeadline);
  const clockStale = useReachedTime(clockDeadline);
  const crossedDeadline = Math.max(statusStale ? statusDeadline! : 0, clockStale ? clockDeadline! : 0);
  const freshness = liveClockFreshness(crossedDeadline, changedAt, verifiedAt, hasMinute);
  const estimatesSeconds = changedAt !== null && hasMinute && freshness === null;
  const value = useSyncExternalStore(estimatesSeconds ? subscribeClock : subscribeIdle,
    () => estimatesSeconds ? liveClockLabel(clock, messages, Date.now())[field] : initial[field],
    () => initial[field]);
  const note = freshness === null ? null : messages.text(freshness === "status-stale" ? "match.clock.statusStale" : "match.clock.lastVerified");
  const verification = note !== null && verifiedAt !== null
    ? messages.text("match.clock.verifiedAt", { time: messages.reportingTime(verifiedAt) }) : null;
  return <><Elapsed data-live-elapsed={hasMinute || undefined} aria-label={initial.spoken}
    title={estimatesSeconds ? messages.text("match.clock.estimated") : undefined}>{value}</Elapsed>
    {freshness && note && <MatchFreshnessIcon reason={freshness} label={[note, verification].filter(Boolean).join(" · ")} />}
  </>;
}
