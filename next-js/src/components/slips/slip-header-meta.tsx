"use client";

import styled from "styled-components";
import { LiveDot } from "@/components/ui/live-dot";
import { StatusBadge as BaseStatusBadge } from "@/components/ui/status-badge";
import { getReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { SlipResultView } from "@/domain/slip-snapshot";
import type { SlipStatus } from "@/domain/slip-status";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { formatSlipPublicationDate } from "./slip-format";

export type SlipHeaderPublication = { publicationDay?: ReportingDate; publishedAt?: number };

const PublicationTime = styled.time`
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.body};
  line-height: var(--gh-leading-label); white-space: nowrap; font-variant-numeric: tabular-nums;
  [data-slip-date-layout="desktop"] { display: none; }
  ${media.desktop} {
    [data-slip-date-layout="mobile"] { display: none; }
    [data-slip-date-layout="desktop"] { display: inline; }
  }
`;

/** A publication date never implies an invented midnight timestamp. */
export function SlipHeaderDate({ publicationDay, publishedAt, locale }: SlipHeaderPublication & { locale: string }) {
  const m = createMessages(locale);
  if (publishedAt !== undefined) {
    const instant = utcInstantFromEpochMilliseconds(publishedAt);
    const day = getReportingDate(instant), parts = m.reportingDayParts(day);
    return <PublicationTime data-slip-publication-date dateTime={toUtcIsoString(instant)}>
      <strong data-slip-date-layout="mobile" data-slip-generated-at>
        {parts.day} {parts.month} · {m.reportingTime(instant)} EAT</strong>
      <span data-slip-date-layout="desktop">{formatSlipPublicationDate(day, locale)} · {m.reportingTime(instant)} EAT</span>
    </PublicationTime>;
  }
  if (!publicationDay) return null;
  const parts = m.reportingDayParts(publicationDay);
  return <PublicationTime data-slip-publication-date dateTime={publicationDay}>
    <strong data-slip-date-layout="mobile">{parts.day} {parts.month} · EAT</strong>
    <span data-slip-date-layout="desktop">{formatSlipPublicationDate(publicationDay, locale)} · EAT</span>
  </PublicationTime>;
}

const ProgressDot = styled(LiveDot)`
  margin-inline-end: var(--gh-spacing-1_25);
`;

const StatusBadge = styled(BaseStatusBadge)`
  --slip-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --slip-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  --status-ink: var(--slip-status-ink);
  --status-fill: var(--slip-status-fill);
  &[data-slip-status-value="not-started"] { --slip-status-ink: ${({ theme }) => theme.color.mutedText}; --slip-status-fill: ${({ theme }) => theme.color.surfaceMuted}; }
  &[data-slip-status-value="in-progress"] {
    --slip-status-ink: ${({ theme }) => theme.color.accent.blue.text};
    --slip-status-fill: ${({ theme }) => theme.color.accent.blue.soft};
  }
  &[data-slip-status-value="won"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-slip-status-value="lost"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-slip-status-value="void"] { --slip-status-ink: ${({ theme }) => theme.color.outcome.void.text}; --slip-status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
  &[data-slip-status-value="cancelled"] { --slip-status-ink: ${({ theme }) => theme.color.accent.orange.text}; --slip-status-fill: ${({ theme }) => theme.color.accent.orange.soft}; }
`;

export function SlipStatusBadge({ outcome, status = outcome, locale }: { outcome: SlipResultView["outcome"]; status?: SlipStatus; locale: string }) {
  const m = createMessages(locale);
  return <StatusBadge data-slip-status data-slip-outcome={outcome} data-slip-status-value={status}>
    <VisuallyHidden>{m.text("slips.header.status")}: </VisuallyHidden>
    {status === "in-progress" && <ProgressDot data-slip-progress-dot aria-hidden="true" />}
    <span data-status-full>{m.text(`slips.header.${status}`)}</span>
  </StatusBadge>;
}
