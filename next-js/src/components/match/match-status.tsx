"use client";

import styled from "styled-components";
import { LiveDot } from "@/components/ui/live-dot";
import { StatusBadge } from "@/components/ui/status-badge";
import { cardResultStatus } from "@/domain/match-card";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { Messages } from "@/i18n/messages";
import type { OutcomeTone } from "@/styles/theme";

const Label = styled(StatusBadge)`
  --status-ink: ${({ theme }) => theme.color.mutedText};
  --status-fill: ${({ theme }) => theme.color.surfaceMuted};
  gap: 6px; font-size: 0.8125rem;
  &[data-match-status="live"] { --status-ink: ${({ theme }) => theme.color.live.text}; --status-fill: ${({ theme }) => theme.color.live.soft}; }
  &[data-match-status="correct"] { --status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-match-status="incorrect"] { --status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-match-status="pending"] { --status-ink: ${({ theme }) => theme.color.outcome.pending.text}; --status-fill: ${({ theme }) => theme.color.outcome.pending.background}; }
  &[data-match-status="void"] { --status-ink: ${({ theme }) => theme.color.outcome.void.text}; --status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
`;

/** Fixture progress takes precedence until a result can be shown. Saved results remain explicit snapshots. */
export function MatchStatus({ status, outcome, messages, snapshot = false, offline = false }: {
  status: FixtureSnapshot["status"]; outcome: OutcomeTone; messages: Messages; snapshot?: boolean; offline?: boolean;
}) {
  const result = offline ? "saved" : snapshot ? outcome : cardResultStatus(status, outcome);
  const isOutcome = result === "correct" || result === "incorrect" || result === "pending" || result === "void" || result === "unavailable";
  const label = result === "saved" ? "Saved" : result === "upcoming" ? messages.text("match.result.upcoming")
    : result === "correct" ? messages.text("slips.result.won") : result === "incorrect" ? messages.text("slips.result.lost")
    : result === "unavailable" ? "—" : result === "unknown" ? messages.text("slips.match.unknown")
      : messages.text(isOutcome ? `outcome.${result}` : `match.status.${result}`);
  return <Label data-match-status={result} data-match-label={!isOutcome ? "" : undefined} data-outcome-label={isOutcome ? "" : undefined}>
    {result === "live" && <LiveDot data-match-live-dot aria-hidden="true" />}
    <span data-pick-value="">{label}</span>
  </Label>;
}
