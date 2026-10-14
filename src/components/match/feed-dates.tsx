"use client";

import Link from "next/link";
import { useId } from "react";
import styled from "styled-components";
import { RangeFields, RangeFieldset, RangeHelp, RangeLegend } from "./feed-range-fields";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import { feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { focusRing, plainClick } from "./filter-parts";

/** Always-visible dates; equal endpoints select one date. */
export function DateRangePicker({ query, today, from, to, onChange }: {
  query: FeedQuery; today: ReportingDate; from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const messages = createMessages(query.locale), id = useId();
  let dates: DateSelection | null = null, maximumTo: ReportingDate | undefined;
  try {
    const start = parseReportingDate(from);
    try { maximumTo = addReportingDays(start, feedQueryRules.maximumDays - 1); }
    catch { maximumTo = parseReportingDate("9999-12-31"); }
    const end = parseReportingDate(to);
    const selection: DateSelection = start === end ? { kind: "date", date: start } : { kind: "range", from: start, to: end };
    resolveFeedDates({ dates: selection }, today);
    dates = selection;
  } catch { /* Incomplete or invalid endpoints stay editable without changing the applied query. */ }
  const invalid = dates === null;
  return <RangeFieldset aria-label={messages.text("feed.date.range")}>
    <RangeLegend>{messages.text("feed.date.title")}</RangeLegend>
    <RangeFields data-range="dates">
      <label><span>{messages.text("feed.date.from")}</span><input type="date" value={from}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value, to)} /></label>
      <label><span>{messages.text("feed.date.to")}</span><input type="date" value={to} min={from || undefined} max={maximumTo}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(from, event.target.value)} /></label>
      {invalid && <RangeHelp id={`${id}-error`} role="alert">{messages.text("feed.date.tooLong")}</RangeHelp>}
    </RangeFields>
  </RangeFieldset>;
}

const PresetList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};
  > a {
    display: inline-grid;
    place-items: center;
    min-block-size: 2.125rem;
    padding-inline: 12px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    text-decoration: none;
    ${focusRing}
    ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.accent.teal.text}; } }
    &[aria-current="date"] { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;

export function DatePresets({ query, today, onApply, kinds = ["today", "next-3-days", "next-7-days", "next-30-days"] }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; kinds?: readonly FeedDatePreset[];
}) {
  const messages = createMessages(query.locale), presets = feedDateNavigation(query, today).presets.filter((preset) => kinds.includes(preset.kind));
  return <PresetList role="group" aria-label={messages.text("feed.date.presets")}>
    {presets.map(({ kind, href, current }) => <Link key={kind} href={href} prefetch={false} aria-current={current ? "date" : undefined}
      onClick={(event) => plainClick(event, () => onApply({ ...query, dates: { kind }, page: 1 }))}>
      {messages.text(`feed.date.${kind}`)}
    </Link>)}
  </PresetList>;
}
