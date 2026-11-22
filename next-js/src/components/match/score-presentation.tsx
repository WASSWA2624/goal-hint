"use client";

import { useSyncExternalStore } from "react";
import styled, { css } from "styled-components";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { matchCardScore } from "@/domain/match-card";
import { liveClockLabel } from "@/domain/match-clock";
import type { Messages } from "@/i18n/messages";

export const liveScoreText = css`color: ${({ theme }) => theme.color.live.text};`;

/** Larger figures and a wider separator fit inside the existing score slot. */
export const Scoreline = styled.span`
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--gh-font-section); font-weight: ${({ theme }) => theme.typography.weight.bold};
  /* Retain the original 13px × 1.3 line box so compact cards do not grow. */
  line-height: var(--gh-size-4_225); font-variant-numeric: tabular-nums; white-space: nowrap;
  [data-score-separator] { flex: none; inline-size: var(--gh-size-4); text-align: center; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  [data-status="live"] & { ${liveScoreText} }
`;

const ShootoutScore = styled.span`
  margin-inline-start: var(--gh-spacing-0_75);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-medium);
`;

export function ScoreFigures({ home, away, lead = 0, shootout }: {
  home: string; away: string; lead?: number; shootout?: Readonly<{ home: string; away: string }> | null;
}) {
  return <><span data-score-home data-loss={lead < 0 || undefined}>{home}{shootout && <ShootoutScore data-shootout-score>({shootout.home})</ShootoutScore>}</span>
    <span data-score-separator>–</span><span data-score-away data-loss={lead > 0 || undefined}>{away}{shootout && <ShootoutScore data-shootout-score>({shootout.away})</ShootoutScore>}</span></>;
}

export function matchScoreDescription(display: ReturnType<typeof matchCardScore>, names: Readonly<{ home: string; away: string }>,
  messages: Messages, final: boolean, snapshot: boolean) {
  const { score, shootout, regulationOnly } = display;
  const description = score ? messages.text("match.scoreline", { ...names,
    label: messages.text(snapshot || regulationOnly ? "match.regulationScoreNote" : final ? "match.finalScore" : "match.liveScore"),
    homeScore: messages.number(score.home), awayScore: messages.number(score.away),
  }) : messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown");
  return shootout ? `${description}. ${messages.text("match.scoreline", { ...names, label: messages.text("match.shootoutScore"),
    homeScore: messages.number(shootout.home), awayScore: messages.number(shootout.away) })}` : description;
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
const Elapsed = styled.span`font-variant-numeric: tabular-nums; white-space: nowrap;`;

/** Only the small clock text subscribes to the shared browser ticker. */
export function LiveMatchTime({ clock, messages, badge = false, showStoppageSeconds = false }: {
  clock: FixtureSnapshot["liveClock"]; messages: Messages; badge?: boolean; showStoppageSeconds?: boolean;
}) {
  const initial = liveClockLabel(clock, messages, undefined, showStoppageSeconds);
  const field = badge ? "badge" : "visible";
  const estimatesSeconds = clock?.observedAt !== undefined && (badge ? initial.badgeTicks : initial.minute !== null);
  const value = useSyncExternalStore(estimatesSeconds ? subscribeClock : subscribeIdle,
    () => estimatesSeconds ? liveClockLabel(clock, messages, Date.now(), showStoppageSeconds)[field] : initial[field],
    () => initial[field]);
  return <Elapsed data-live-elapsed={initial.minute !== null || undefined}
    title={estimatesSeconds ? messages.text("match.clock.estimated") : undefined}>{value}</Elapsed>;
}
