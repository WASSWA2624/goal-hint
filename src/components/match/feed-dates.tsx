"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import styled from "styled-components";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { RangeFields, RangeFieldset, RangeHelp } from "./feed-range-fields";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { controlFeedback, focusRing, plainClick } from "./filter-parts";

export function rangeLabel(query: FeedQuery, today: ReportingDate) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  return range.dayCount === 1 ? messages.reportingDateMedium(range.startDate)
    : messages.text("feed.date.rangeLabel", { from: messages.reportingDateMedium(range.startDate), to: messages.reportingDateMedium(range.endDate) });
}

// Immutable EAT formatters, shared by locale.
const shortRangeFormats = new Map<string, { monthDay: Intl.DateTimeFormat; day: Intl.DateTimeFormat }>();
function shortRangeFormat(language: string) {
  let formats = shortRangeFormats.get(language);
  if (!formats) {
    const zone = { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory" } as const;
    formats = { monthDay: new Intl.DateTimeFormat(language, { ...zone, month: "short", day: "numeric" }),
      day: new Intl.DateTimeFormat(language, { ...zone, day: "numeric" }) };
    shortRangeFormats.set(language, formats);
  }
  return formats;
}
/** Phone range label without weekdays or year, e.g. "Oct 10 – 16" or "Oct 28 – Nov 3". */
export function shortRangeLabel(query: FeedQuery, today: ReportingDate) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const { monthDay, day } = shortRangeFormat(resolveLocale(query.locale));
  // The last instant of the final EAT day.
  const start = range.window.startInclusive, end = range.window.endExclusive - 1;
  if (range.dayCount === 1) return monthDay.format(start);
  return messages.text("feed.date.rangeLabel", { from: monthDay.format(start),
    to: (range.startDate.slice(0, 7) === range.endDate.slice(0, 7) ? day : monthDay).format(end) });
}

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
  return <RangeFieldset>
    <legend>{messages.text("feed.date.range")}</legend>
    <RangeFields>
      <label>{messages.text("feed.date.from")}<input type="date" value={from}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value, to)} /></label>
      <label>{messages.text("feed.date.to")}<input type="date" value={to} min={from || undefined} max={maximumTo}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(from, event.target.value)} /></label>
      {invalid && <RangeHelp id={`${id}-error`} role="alert">{messages.text("feed.date.tooLong")}</RangeHelp>}
    </RangeFields>
  </RangeFieldset>;
}

/**
 * One compact "‹ date ›" control: previous and next steps surround the applied range summary.
 */
const Stepper = styled.div`
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr) 1.75rem;
  min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  ${controlFeedback}
  > a, > span {
    display: grid;
    place-items: center;
    min-block-size: 1.875rem;
    color: ${({ theme }) => theme.color.brand};
    font-size: 1rem;
    ${focusRing}
  }
  ${media.hover} { > a:hover { background: ${({ theme }) => theme.color.brandSoft}; } }
  > span { color: ${({ theme }) => theme.color.disabledText}; }
  > [data-range-summary] {
    min-inline-size: 0;
    padding: 3px 6px;
    color: ${({ theme }) => theme.color.text};
    font-size: 0.75rem;
    line-height: 1.3;
    text-align: center;
    overflow-wrap: anywhere;
  }
`;

/** Previous/next day, or the adjacent block of equal length for a range, around the applied date summary. */
export function DateStepper({ query, today, onApply, children }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; children: ReactNode;
}) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const shifted = (offset: number): FeedQuery | null => {
    try {
      const start = addReportingDays(range.startDate, offset * range.dayCount);
      if (start < "1000-01-01") return null;
      const dates: DateSelection = range.dayCount === 1 ? { kind: "date", date: start }
        : { kind: "range", from: start, to: addReportingDays(start, range.dayCount - 1) };
      return { ...query, dates, page: 1 };
    } catch { return null; }
  };
  const [previous, following] = ([-1, 1] as const).map((offset) => {
    const next = shifted(offset), label = messages.text(offset < 0 ? "feed.date.previous" : "feed.date.next");
    const Icon = offset < 0 ? ChevronLeftIcon : ChevronRightIcon;
    return next ? <Link href={feedQueryHref(next, today)} prefetch={false} aria-label={label} title={label}
      onClick={(event) => plainClick(event, () => onApply(next))}><Icon /></Link>
      : <span aria-hidden="true"><Icon /></span>;
  });
  return <Stepper>{previous}{children}{following}</Stepper>;
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
