"use client";

import styled from "styled-components";
import { LiveDot } from "@/components/ui/live-dot";
import { StatusBadge } from "@/components/ui/status-badge";
import { cardResultStatus } from "@/domain/match-card";
import { liveClockLabel } from "@/domain/match-clock";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { Messages } from "@/i18n/messages";
import { media, type OutcomeTone } from "@/styles/theme";
import { LiveMatchTime } from "./score-presentation";

const Label = styled(StatusBadge)`
  --status-ink: ${({ theme }) => theme.color.outcome.unavailable.text};
  --status-fill: ${({ theme }) => theme.color.outcome.unavailable.background};
  box-shadow: inset 0 0 0 var(--gh-stroke-thin) color-mix(in srgb, var(--status-ink) 40%, var(--status-fill));
  ${media.belowDesktop} {
    background-color: color-mix(in srgb, var(--status-fill) calc(var(--gh-opacity-55) * 100%), transparent);
    box-shadow: inset 0 0 0 var(--gh-stroke-thin) color-mix(in srgb, var(--status-ink) calc(var(--gh-opacity-25) * 100%), transparent);
  }
  gap: var(--gh-spacing-1_5); font-size: var(--gh-font-body);
  &[data-match-status="upcoming"] { --status-ink: ${({ theme }) => theme.color.accent.blue.text}; --status-fill: ${({ theme }) => theme.color.accent.blue.soft}; }
  &[data-match-status="live"] { --status-ink: ${({ theme }) => theme.color.live.text}; --status-fill: ${({ theme }) => theme.color.live.soft}; }
  &[data-live-badge-clock] {
    display: inline-grid; grid-template-columns: minmax(var(--gh-size-1_25), 1fr) minmax(0, max-content) minmax(var(--gh-size-1_25), 1fr);
    gap: 0; font-size: var(--gh-font-emphasis);
    > [data-match-live-dot] { justify-self: start; }
    > [data-pick-value] { overflow: hidden; text-overflow: ellipsis; }
  }
  &[data-match-status="postponed"] {
    --status-ink: ${({ theme }) => theme.color.accent.orange.text}; --status-fill: ${({ theme }) => theme.color.accent.orange.soft};
  }
  &[data-match-status="correct"] { --status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-match-status="incorrect"] { --status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-match-status="pending"] { --status-ink: ${({ theme }) => theme.color.outcome.pending.text}; --status-fill: ${({ theme }) => theme.color.outcome.pending.background}; }
  &[data-match-status="void"] { --status-ink: ${({ theme }) => theme.color.outcome.void.text}; --status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
`;

/** Fixture progress takes precedence until a result can be shown. Saved results remain explicit snapshots. */
export function MatchStatus({ status, outcome, messages, snapshot = false, offline = false, liveClock, desktopClock = false }: {
  status: FixtureSnapshot["status"]; outcome: OutcomeTone; messages: Messages; snapshot?: boolean; offline?: boolean;
  liveClock?: FixtureSnapshot["liveClock"];
  desktopClock?: boolean;
}) {
  const result = offline ? "saved" : snapshot ? outcome : cardResultStatus(status, outcome);
  const isOutcome = result === "correct" || result === "incorrect" || result === "pending" || result === "void" || result === "unavailable";
  const label = result === "saved" ? "Saved" : result === "upcoming" ? messages.text("match.result.upcoming")
    : result === "correct" ? messages.text("slips.result.won") : result === "incorrect" ? messages.text("slips.result.lost")
    : result === "unavailable" ? "—" : result === "unknown" ? messages.text("slips.match.unknown")
      : messages.text(isOutcome ? `outcome.${result}` : `match.status.${result}`);
  const clock = result === "live" && liveClock && (liveClock.minute !== null || liveClock.phase !== "in-play")
    ? liveClockLabel(liveClock, messages) : null;
  const extraTime = clock !== null && clock.minute !== null && liveClock?.phase === "extra-time";
  const finalPhase = !offline && !snapshot && (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties")
    ? messages.text(`match.final.${status}`) : null;
  return <Label data-match-status={result} data-match-label={!isOutcome ? "" : undefined} data-outcome-label={isOutcome ? "" : undefined}
    data-live-badge-clock={desktopClock && result === "live" ? "" : undefined}
    aria-label={clock?.spoken} title={clock?.spoken}>
    {result === "live" && <LiveDot data-match-live-dot aria-hidden="true" />}
    <span data-pick-value="">{clock ? desktopClock ? <LiveMatchTime clock={liveClock} messages={messages} badge />
      : <><span data-mobile-only data-status-clock>{label} {extraTime && <>{messages.text("match.clock.extra-timeShort")} </>}<LiveMatchTime clock={liveClock} messages={messages} /></span><span data-desktop-only>{label}</span></> : label}</span>
    {!desktopClock && liveClock !== undefined && finalPhase && <span data-mobile-only data-status-phase>{finalPhase}</span>}
  </Label>;
}
