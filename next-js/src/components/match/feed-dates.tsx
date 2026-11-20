"use client";

import { DateTimeField } from "@/components/ui/date-time-field";
import Link from "@/components/navigation/navigation-link";
import dynamic from "next/dynamic";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { RangeFields, RangeFieldset, RangeHelp, RangeLegend } from "./feed-range-fields";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { adjacentDays, dayLinkRel, feedDateNavigation } from "@/domain/feed-date-navigation";
import { selectFeedDates } from "@/domain/feed-controls";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { filterButtonColors, focusRing, plainClick } from "./filter-parts";

const DateCalendar = dynamic(() => import("./date-calendar").then((module) => module.DateCalendar));

/** Always-visible dates; equal endpoints select one date. */
export function DateRangePicker({ query, today, from, to, onChange, disabled = false }: {
  query: FeedQuery; today: ReportingDate; from: string; to: string; onChange: (from: string, to: string) => void; disabled?: boolean;
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
  return <RangeFieldset aria-label={messages.text("feed.date.range")} disabled={disabled}>
    <RangeLegend>{messages.text("feed.date.title")}</RangeLegend>
    <RangeFields data-range="dates">
      <DateTimeField label={messages.text("feed.date.from")} value={from}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onValueChange={value => onChange(value, to)} />
      <DateTimeField label={messages.text("feed.date.to")} value={to} min={from || undefined} max={maximumTo}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onValueChange={value => onChange(from, value)} />
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
    min-block-size: var(--form-control-height);
    padding-inline: var(--gh-spacing-3);
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-body);
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    text-decoration: none;
    ${focusRing}
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.accent.teal.text}; } }
    &[aria-current="date"] { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft};  font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;

export function DatePresets({ query, today, onApply, kinds = ["today", "next-3-days", "next-7-days", "next-30-days"] }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; kinds?: readonly FeedDatePreset[];
}) {
  const messages = createMessages(query.locale), presets = feedDateNavigation(query, today).presets.filter((preset) => kinds.includes(preset.kind));
  return <PresetList role="group" aria-label={messages.text("feed.date.presets")}>
    {presets.map(({ kind, current }) => <Link key={kind} href={feedQueryHref(selectFeedDates(query, { kind }, today), today)} prefetch={false} aria-current={current ? "date" : undefined}
      onClick={(event) => plainClick(event, () => onApply(selectFeedDates(query, { kind }, today)))}>
      {messages.text(`feed.date.${kind}`)}
    </Link>)}
  </PresetList>;
}

/** Phones pick a day in one tap from an endless strip; the arrows scroll it and Calendar picks a date or a range. */
const Strip = styled.nav<{ $draft: boolean }>`
  display: ${({ $draft }) => $draft ? "flex" : "none"};
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  ${media.phone} { display: flex; }
`;
/** Whole cells fill the strip so arrows always reveal a complete set of dates. */
const Days = styled.ul`
  position: relative;
  container-type: inline-size;
  display: flex;
  flex: 1;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  overflow-anchor: none;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  > li { flex: none; inline-size: 100cqi; scroll-snap-align: center; }
  @container (min-width: ${({ theme }) => theme.viewport[9.5]}) { > li { inline-size: calc((100cqi - var(--gh-size-2)) / 3); } }
  @container (min-width: ${({ theme }) => theme.viewport[12]}) { > li { inline-size: calc((100cqi - var(--gh-size-4)) / 5); } }
  @container (min-width: ${({ theme }) => theme.viewport[22.5]}) { > li { inline-size: calc((100cqi - var(--gh-size-6)) / 7); } }
`;
const dayCell = css`
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0;
  min-block-size: var(--form-control-height);
  border-radius: ${({ theme }) => theme.radius.control};
  font-variant-numeric: tabular-nums;
  line-height: var(--gh-leading-tight);
  text-decoration: none;
  cursor: pointer;
  > small { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-semibold); white-space: nowrap; }
`;
const dateCell = css`
  ${dayCell}
  inline-size: 100%;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  font-family: inherit;
  > small { color: ${({ theme }) => theme.color.mutedText}; }
  > small[data-today] { color: ${({ theme }) => theme.color.link}; }
  > b { font-size: var(--gh-font-reading); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.brandSoft}; } }
  &[data-selected] {
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};
    border-color: transparent;

    > small { color: inherit; }
  }
  /* Drawn inside, so the scrolling strip never clips the ring. */
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-1)); }
  &[data-selected]:focus-visible { outline-color: ${({ theme }) => theme.color.onAction}; }
`;
const Day = styled(Link)`${dateCell}`;
const DraftDay = styled.button`${dateCell}`;
const Scroll = styled.button`
  ${dayCell}
  flex: none;
  inline-size: var(--gh-size-8);
  padding: 0;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.page};
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  font: inherit;
  > svg { font-size: var(--gh-font-title); }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.brandSoft}; } }
  ${focusRing}
`;
const CalendarButton = styled.button`
  ${dayCell}
  flex: none;
  inline-size: var(--form-control-height);
  margin-inline-start: var(--gh-spacing-2);
  padding: 0;
  ${filterButtonColors}
  font: inherit;
  > svg { font-size: var(--gh-font-title); }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.fieldHover}; } }
  ${focusRing}
`;

/** Days added at a time when the strip nears either end. */
const block = 30;
const smooth = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
// Keep the anchor among the first three chips before hydration centers the strip.
const daysAround = (date: ReportingDate) => [...adjacentDays(date, -2), date, ...adjacentDays(date, 8)];

function stripMetrics(strip: HTMLUListElement) {
  const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
  const step = (strip.firstElementChild?.getBoundingClientRect().width ?? 0) + gap;
  return { step, visible: Math.max(1, Math.round((strip.clientWidth + gap) / step)) };
}

export function DayStrip({ query, today, onApply }: { query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void }) {
  const { startDate, endDate } = resolveFeedDates(query, today), [tomorrow] = adjacentDays(today, 1);
  const select = (from: ReportingDate, to: ReportingDate = from) => selectFeedDates(query,
    from !== to ? { kind: "range", from, to } : from === today ? { kind: "today" }
      : query.status !== "finished" && from === tomorrow ? { kind: "tomorrow" } : { kind: "date", date: from }, today);
  return <DateStrip locale={query.locale} today={today} from={startDate} to={endDate}
    hrefForDay={date => feedQueryHref(select(date), today)} onDatesChange={(from, to) => onApply(select(from, to))} />;
}

/** Without link targets, dates edit an enclosing Filters draft and the child calendar uses its native dialog layer. */
export function DateStrip({ locale, today, from: startDate, to: endDate, hrefForDay, onDatesChange }: {
  locale: FeedQuery["locale"]; today: ReportingDate; from: ReportingDate; to: ReportingDate;
  hrefForDay?: (date: ReportingDate) => string; onDatesChange: (from: ReportingDate, to: ReportingDate) => void;
}) {
  const messages = createMessages(locale), draft = hrefForDay === undefined;
  const selected = startDate === endDate ? startDate : null;
  const anchor = today < startDate ? startDate : today > endDate ? endDate : today;
  const list = useRef<HTMLUListElement>(null), calendarButton = useRef<HTMLButtonElement>(null);
  const listId = useId(), calendarId = useId();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [days, setDays] = useState(() => daysAround(anchor));
  const [visible, setVisible] = useState<{ first: ReportingDate; last: ReportingDate } | null>(null);
  if (anchor < days[0]! || anchor > days.at(-1)!) setDays(daysAround(anchor));
  const prepended = useRef<{ offset: number; count: number } | null>(null);
  const growing = useRef(false), activated = useRef(false), arrowTarget = useRef<ReportingDate | null>(null), handled = useRef(days);
  const chips = useMemo(() => days.map((date) => {
    const { day, month } = messages.reportingDayParts(date), isToday = date === today;
    const label = messages.reportingDate(date);
    return { date, day, month, isToday, href: hrefForDay?.(date),
      label: isToday ? `${messages.text("feed.date.today")}, ${label}` : label };
  }), [days, hrefForDay, messages, today]);
  const center = useCallback((date: ReportingDate, behavior: ScrollBehavior) => {
    const strip = list.current, cell = strip?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (strip && cell) strip.scrollTo({ left: cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2, behavior });
  }, []);
  const reveal = useCallback((date: ReportingDate) => {
    const strip = list.current, cell = strip?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (strip && cell) strip.scrollTo({ left: strip.scrollLeft + cell.getBoundingClientRect().left - strip.getBoundingClientRect().left,
      behavior: smooth() });
  }, []);
  const extend = useCallback(() => {
    const strip = list.current;
    if (!strip?.clientWidth) return false;
    if (growing.current) return true;
    const current = handled.current;
    const target = arrowTarget.current;
    const cell = target && strip.querySelector<HTMLElement>(`[data-date="${target}"]`);
    const offset = cell ? cell.offsetLeft : strip.scrollLeft;
    const first = current[0]!, last = current.at(-1)!;
    const earlier = (target !== null && target < first || offset < strip.clientWidth) ? adjacentDays(first, -block) : [];
    const later = (target !== null && target > last || offset + strip.clientWidth * 2 > strip.scrollWidth) ? adjacentDays(last, block) : [];
    if (!earlier.length && !later.length) return false;
    growing.current = true;
    if (earlier.length) prepended.current = { offset: strip.scrollLeft, count: earlier.length };
    setDays([...earlier, ...current, ...later]);
    return true;
  }, []);
  const updateVisible = useCallback(() => {
    const strip = list.current;
    if (!strip?.clientWidth) return;
    const { step, visible } = stripMetrics(strip), days = handled.current;
    const index = Math.max(0, Math.round(strip.scrollLeft / step));
    const first = days[index], last = days[Math.min(index + visible - 1, days.length - 1)];
    if (first && last) setVisible(current => current?.first === first && current.last === last ? current : { first, last });
  }, []);
  useLayoutEffect(() => {
    // Days added before the visible ones keep the same days in view. Each new list is handled once.
    if (handled.current === days) return;
    handled.current = days;
    const strip = list.current;
    if (strip?.clientWidth && prepended.current) {
      const { offset, count } = prepended.current;
      strip.scrollLeft = offset + count * stripMetrics(strip).step;
    }
    prepended.current = null;
    growing.current = false;
    if (arrowTarget.current && !extend()) reveal(arrowTarget.current);
    updateVisible();
  }, [days, extend, reveal, updateVisible]);
  useLayoutEffect(() => {
    if (!list.current?.clientWidth) return;
    arrowTarget.current = null;
    center(anchor, "auto");
    updateVisible();
  }, [anchor, center, endDate, startDate, updateVisible]);
  useLayoutEffect(() => {
    const strip = list.current;
    if (!strip) return;
    let width = strip.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = strip.clientWidth;
      if (nextWidth === width) return;
      width = nextWidth;
      if (width) {
        arrowTarget.current = null;
        center(anchor, "auto");
        updateVisible();
      } else setCalendarOpen(false);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [anchor, center, updateVisible]);
  const activate = () => { arrowTarget.current = null; activated.current = true; extend(); };
  /** Accumulate button presses against the requested date while smooth scrolling catches up. */
  const move = (direction: -1 | 1) => {
    const strip = list.current;
    if (!strip?.clientWidth) return;
    const { step, visible } = stripMetrics(strip);
    const first = arrowTarget.current ?? handled.current[Math.max(0, Math.round(strip.scrollLeft / step))];
    if (!first) return;
    const [next] = adjacentDays(first, direction);
    if (!next || (direction === 1 && adjacentDays(next, visible - 1).length < visible - 1)) return;
    arrowTarget.current = next;
    if (!extend()) reveal(next);
  };
  const closeCalendar = () => { setCalendarOpen(false); calendarButton.current?.focus({ preventScroll: true }); };
  return <Strip $draft={draft} aria-label={messages.text("feed.date.days")}>
    <Scroll type="button" aria-controls={listId} aria-label={messages.text("feed.date.earlier")} onClick={() => move(-1)}>
      <ChevronLeftIcon />
    </Scroll>
    <Days id={listId} ref={list} onScroll={() => { updateVisible(); if (activated.current && !arrowTarget.current) extend(); }}
      onPointerDown={activate} onWheel={activate} onFocus={activate}
      onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) activate(); }}>
      {chips.map(({ date, day, month, isToday, href, label }) => {
        const state = { "aria-current": date === selected ? "date" as const : undefined, "data-selected": date === selected || undefined,
          "aria-label": label, tabIndex: visible && (date < visible.first || date > visible.last) ? -1 : undefined };
        const cell = <><b>{day}</b><small data-today={isToday || undefined}>{isToday ? messages.text("feed.date.today") : month}</small></>;
        return <li key={date} data-date={date}>
          {href === undefined ? <DraftDay type="button" {...state} onClick={() => onDatesChange(date, date)}>{cell}</DraftDay>
            : <Day {...state} href={href} prefetch={false} scroll={false} rel={dayLinkRel(date, today)}
              onClick={event => plainClick(event, () => onDatesChange(date, date))}>{cell}</Day>}
        </li>;
      })}
    </Days>
    <Scroll type="button" aria-controls={listId} aria-label={messages.text("feed.date.later")} onClick={() => move(1)}>
      <ChevronRightIcon />
    </Scroll>
    <CalendarButton ref={calendarButton} type="button"
      aria-haspopup="dialog" aria-expanded={calendarOpen} aria-controls={calendarOpen ? calendarId : undefined}
      onClick={event => { event.currentTarget.focus({ preventScroll: true }); setCalendarOpen(true); }}
      aria-label={selected === null ? messages.text("feed.date.rangeCurrent", { range: messages.reportingDateSpan(startDate, endDate) }) : messages.text("feed.date.rangeOpen")}>
      <CalendarIcon />
    </CalendarButton>
    {calendarOpen && <DateCalendar id={calendarId} presentation={draft ? "dialog" : "sheet"} locale={locale}
      today={today} from={startDate} to={endDate} onClose={closeCalendar}
      onApply={(from, to) => {
        closeCalendar();
        onDatesChange(from, to);
      }} />}
  </Strip>;
}
