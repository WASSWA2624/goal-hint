"use client";

import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipStatus } from "@/domain/slip-status";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createMessages } from "@/i18n/messages";

export type SlipHeaderPublication = { publicationDay?: ReportingDate; publishedAt?: number };

const PublicationTime = styled.time`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body};
  line-height: 1.3; white-space: nowrap; font-variant-numeric: tabular-nums;
`;

/** A publication date never implies an invented midnight timestamp. */
export function SlipHeaderDate({ publicationDay, publishedAt, locale }: SlipHeaderPublication & { locale: string }) {
  const m = createMessages(locale);
  if (publishedAt !== undefined) {
    const instant = utcInstantFromEpochMilliseconds(publishedAt);
    return <PublicationTime data-slip-publication-date dateTime={toUtcIsoString(instant)}>{m.reportingInstant(instant)}</PublicationTime>;
  }
  return publicationDay ? <PublicationTime data-slip-publication-date dateTime={publicationDay}>{m.reportingDateMedium(publicationDay)} · EAT</PublicationTime> : null;
}

const StatusBadge = styled.span`
  --slip-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --slip-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  display: inline-flex; flex: none; align-items: center; justify-content: center;
  inline-size: 5.75rem; min-block-size: 1.5rem; padding: 3px 5px; box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--slip-status-ink) 30%, transparent); border-radius: 0;
  background: var(--slip-status-fill); color: var(--slip-status-ink);
  font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.2; text-align: center; white-space: nowrap;
  &[data-slip-status-value="not-started"] { --slip-status-ink: ${({ theme }) => theme.color.mutedText}; --slip-status-fill: ${({ theme }) => theme.color.surfaceMuted}; }
  &[data-slip-status-value="in-progress"] { --slip-status-ink: ${({ theme }) => theme.color.live.text}; --slip-status-fill: ${({ theme }) => theme.color.live.soft}; }
  &[data-slip-status-value="won"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-slip-status-value="lost"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-slip-status-value="void"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.void.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
  &[data-slip-status-value="cancelled"] { --slip-status-ink: ${({ theme }) => theme.color.accent.orange.text}; --slip-status-fill: ${({ theme }) => theme.color.accent.orange.soft}; }
`;

export function SlipStatusBadge({ outcome, status = outcome, locale }: { outcome: SavedSlipView["outcome"]; status?: SlipStatus; locale: string }) {
  const m = createMessages(locale);
  return <StatusBadge data-slip-status data-slip-outcome={outcome} data-slip-status-value={status}>
    <VisuallyHidden>{m.text("slips.header.status")}: </VisuallyHidden>
    <span data-status-full>{m.text(`slips.header.${status}`)}</span>
  </StatusBadge>;
}
