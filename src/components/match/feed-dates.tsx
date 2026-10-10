"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { CalendarIcon } from "./match-icons";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { focusRing, plainClick } from "./filter-parts";

const field = css`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-block-size: 2.375rem;
  padding-inline: 12px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  font: inherit;
  font-size: 0.875rem;
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 1.0625rem; }
  > svg:first-child { color: ${({ theme }) => theme.color.accent.teal.solid}; }
  &:hover { border-color: ${({ theme }) => theme.color.accent.teal.solid}; }
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
const Popover = styled.div`
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 15;
  display: grid;
  gap: ${({ theme }) => theme.space.sm};
  inline-size: min(19rem, calc(100vw - 32px));
  padding: ${({ theme }) => theme.space.md};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  label { display: grid; gap: 4px; font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  input {
    min-block-size: 2.5rem;
    padding-inline: ${({ theme }) => theme.space.sm};
    color: ${({ theme }) => theme.color.text};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: 8px;
    font: inherit;
    ${focusRing}
  }
  p { color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem; }
`;
const PopoverAction = styled.button`
  min-block-size: 2.5rem;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme }) => theme.gradient.action};
  border: 0;
  border-radius: 10px;
  font: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  &:hover { filter: brightness(0.95); }
  ${focusRing}
`;
const Anchor = styled.div`position: relative; min-inline-size: 0; display: flex;`;

export function rangeLabel(query: FeedQuery, today: ReportingDate) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  return range.dayCount === 1 ? messages.reportingDateMedium(range.startDate)
    : messages.text("feed.date.rangeLabel", { from: messages.reportingDateMedium(range.startDate), to: messages.reportingDateMedium(range.endDate) });
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
  return <Anchor ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <FieldButton ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => {
      setFrom(range.startDate); setTo(range.endDate); setError(false); setOpen(!open);
    }} aria-label={`${messages.text("feed.date.choose")}: ${rangeLabel(query, today)}`}>
      <CalendarIcon /><span>{rangeLabel(query, today)}</span>{!compact && <ChevronDownIcon />}
    </FieldButton>
    {open && <Popover id={id} role="group" aria-label={messages.text("feed.date.choose")}>
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
  border-radius: 10px;
  > a, > span {
    display: grid;
    place-items: center;
    inline-size: 2.5rem;
    min-block-size: 2.25rem;
    color: ${({ theme }) => theme.color.accent.blue.text};
    font-size: 1.125rem;
    &:hover { background: ${({ theme }) => theme.color.accent.blue.soft}; }
    ${focusRing}
  }
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
    min-block-size: 2.375rem;
    padding-inline: 14px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    text-decoration: none;
    ${focusRing}
    &:hover { border-color: ${({ theme }) => theme.color.accent.blue.solid}; color: ${({ theme }) => theme.color.accent.blue.text}; }
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
