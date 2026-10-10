"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { CalendarIcon } from "./match-icons";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { focusRing, plainClick } from "./filter-parts";

const field = css`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-block-size: 1.875rem;
  padding-inline: 9px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  font: inherit;
  font-size: 0.6875rem;
  white-space: nowrap;
  ${media.desktop} { min-block-size: 2.125rem; font-size: 0.8125rem; }
  cursor: pointer;
  > svg { flex: none; font-size: 0.875rem; }
  > svg:first-child { color: ${({ theme }) => theme.color.accent.teal.solid}; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.accent.teal.solid}; } }
  ${focusRing}
`;
const FieldButton = styled.button`${field} min-inline-size: 0; > span { overflow: hidden; text-overflow: ellipsis; }`;
const FieldLabel = styled.label`${field} &:focus-within { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }`;
/** The native picker covers the visible label, so taps and keyboards open the platform calendar. */
const OverlayInput = styled.input`
  position: absolute;
  inset: 0;
  inline-size: 100%;
  opacity: 0;
  cursor: pointer;
  &::-webkit-calendar-picker-indicator { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; cursor: pointer; }
`;
/**
 * Compact phone sizes; desktop keeps its roomier popover. In the phone filters the popover starts
 * at the date row's edge (the nearest positioned box) and never outgrows it, so it stays on screen.
 */
const Popover = styled.div<{ $compact: boolean }>`
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 15;
  display: grid;
  gap: 6px;
  inline-size: min(19rem, calc(100vw - 32px));
  padding: 12px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  ${({ $compact }) => $compact && css`inset-inline: 0 auto; inline-size: min(19rem, 100%);`}
  label { display: grid; gap: 3px; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  input {
    min-block-size: 2.25rem;
    padding-inline: ${({ theme }) => theme.space.sm};
    color: ${({ theme }) => theme.color.text};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: 6px;
    font: inherit;
    ${focusRing}
  }
  p { color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.75rem; }
  ${media.desktop} {
    gap: ${({ theme }) => theme.space.sm};
    padding: ${({ theme }) => theme.space.md};
    label { gap: 4px; font-size: 0.875rem; }
    input { min-block-size: 2.5rem; border-radius: 8px; }
    p { font-size: 0.8125rem; }
  }
`;
const PopoverAction = styled.button`
  min-block-size: 2.25rem;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme }) => theme.gradient.action};
  border: 0;
  border-radius: 6px;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  ${media.desktop} { min-block-size: 2.5rem; border-radius: 10px; font-size: inherit; }
  ${media.hover} { &:hover { filter: brightness(0.95); } }
  ${focusRing}
`;
const Anchor = styled.div<{ $compact: boolean }>`
  position: ${({ $compact }) => $compact ? "static" : "relative"};
  min-inline-size: 0;
  display: flex;
`;

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

/** Choose any range of up to 31 days. Invalid input never leaves the popover. */
export function DateRangePicker({ query, today, onApply, compact = false }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; compact?: boolean;
}) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const [open, setOpen] = useState(false), [from, setFrom] = useState<string>(range.startDate), [to, setTo] = useState<string>(range.endDate);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function show() {
    try {
      const start = parseReportingDate(from), end = parseReportingDate(to);
      const dates: DateSelection = start === end ? { kind: "date", date: start } : { kind: "range", from: start, to: end };
      resolveFeedDates({ dates }, today);
      setOpen(false); setError(false);
      onApply({ ...query, dates, page: 1 });
    } catch { setError(true); }
  }
  // The accessible name repeats the visible text; the compact label keeps the full dates as a title.
  const label = rangeLabel(query, today), shown = compact ? shortRangeLabel(query, today) : label;
  return <Anchor ref={root} $compact={compact} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <FieldButton ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => {
      setFrom(range.startDate); setTo(range.endDate); setError(false); setOpen(!open);
    }} aria-label={`${messages.text("feed.date.choose")}: ${shown}`} title={compact ? label : undefined}>
      <CalendarIcon /><span>{shown}</span>{!compact && <ChevronDownIcon />}
    </FieldButton>
    {open && <Popover id={id} $compact={compact} role="group" aria-label={messages.text("feed.date.choose")}>
      <label>{messages.text("feed.date.from")}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>{messages.text("feed.date.to")}<input type="date" value={to} min={from}
        max={(() => { try { return addReportingDays(parseReportingDate(from), feedQueryRules.maximumDays - 1); } catch { return undefined; } })()}
        onChange={(event) => setTo(event.target.value)} /></label>
      {error && <p role="alert">{messages.text("feed.date.tooLong")}</p>}
      <PopoverAction type="button" onClick={show}>{messages.text("feed.date.show")}</PopoverAction>
    </Popover>}
  </Anchor>;
}

/** One day, picked with the platform calendar; works as a plain label without changes. */
export function SingleDatePicker({ query, today, onApply }: { query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void }) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  return <FieldLabel>
    <CalendarIcon /><span>{messages.reportingDateShort(range.startDate)}</span>
    <OverlayInput type="date" value={range.startDate} aria-label={messages.text("feed.date.choose")} onChange={(event) => {
      try { onApply({ ...query, dates: { kind: "date", date: parseReportingDate(event.target.value) }, page: 1 }); }
      catch { /* An incomplete native value keeps the current date. */ }
    }} />
  </FieldLabel>;
}

const Stepper = styled.div`
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  flex: none;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  > a, > span {
    display: grid;
    place-items: center;
    inline-size: 2rem;
    min-block-size: 1.75rem;
    color: ${({ theme }) => theme.color.accent.blue.text};
    font-size: 0.875rem;
    ${focusRing}
  }
  ${media.hover} { > a:hover { background: ${({ theme }) => theme.color.accent.blue.soft}; } }
  overflow: hidden;
  > :first-child { border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  > span { color: ${({ theme }) => theme.color.disabledText}; }
`;

/** Previous/next day, or the adjacent block of equal length for a range. */
export function DateStepper({ query, today, onApply }: { query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void }) {
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
  return <Stepper>
    {([-1, 1] as const).map((offset) => {
      const next = shifted(offset), label = messages.text(offset < 0 ? "feed.date.previous" : "feed.date.next");
      const Icon = offset < 0 ? ChevronLeftIcon : ChevronRightIcon;
      return next ? <Link key={offset} href={feedQueryHref(next, today)} prefetch={false} aria-label={label} title={label}
        onClick={(event) => plainClick(event, () => onApply(next))}><Icon /></Link>
        : <span key={offset} aria-hidden="true"><Icon /></span>;
    })}
  </Stepper>;
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
    ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.accent.blue.solid}; color: ${({ theme }) => theme.color.accent.blue.text}; } }
    &[aria-current="date"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.gradient.action}; border-color: transparent; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
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
