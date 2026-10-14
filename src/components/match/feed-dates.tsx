"use client";

import Link from "next/link";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { DateCalendar } from "./date-calendar";
import { RangeFields, RangeFieldset, RangeHelp, RangeLegend } from "./feed-range-fields";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
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

/** Phones pick a day in one tap from an endless strip; the arrows scroll it and Calendar picks a date or a range. */
const Strip = styled.nav`
  display: flex;
  gap: 4px;
  min-inline-size: 0;
  ${media.desktop} { display: none; }
`;
/** Whole cells fill the strip: three, five or seven (48px or wider, so a Day-Month label fits), so the selected day can sit exactly in the middle. */
const Days = styled.ul`
  position: relative;
  container-type: inline-size;
  display: flex;
  flex: 1;
  gap: 4px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  > li { flex: none; inline-size: calc((100cqi - 8px) / 3); scroll-snap-align: center; }
  @container (min-width: 256px) { > li { inline-size: calc((100cqi - 16px) / 5); } }
  @container (min-width: 360px) { > li { inline-size: calc((100cqi - 24px) / 7); } }
`;
const dayCell = css`
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0;
  min-block-size: 2.75rem;
  border-radius: 0;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-decoration: none;
  cursor: pointer;
  > small { font-size: 0.625rem; font-weight: 600; white-space: nowrap; }
`;
const Day = styled(Link)`
  ${dayCell}
  inline-size: 100%;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > small { color: ${({ theme }) => theme.color.mutedText}; }
  /* Every day names its weekday and month; today's label is teal. */
  > small[data-today] { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > b { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; } }
  &[data-selected] {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    border-color: ${({ theme }) => theme.color.brand};
    > small { color: inherit; }
  }
  /* Drawn inside, so the scrolling strip never clips the ring. */
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -4px; }
  &[data-selected]:focus-visible { outline-color: ${({ theme }) => theme.color.onBrand}; }
`;
const Scroll = styled.button`
  ${dayCell}
  flex: none;
  inline-size: 2rem;
  padding: 0;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  font: inherit;
  > svg { font-size: 1.125rem; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; } }
  ${focusRing}
`;
const CalendarButton = styled.button`
  ${dayCell}
  flex: none;
  min-inline-size: 3.5rem;
  max-inline-size: 7.5rem;
  padding: 2px 6px;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} dashed ${({ theme }) => theme.color.controlBorder};
  font: inherit;
  > svg { font-size: 1rem; }
  > b { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; text-align: center; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; } }
  &[data-current] {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.brand};
  }
  ${focusRing}
`;

/** Days added at a time when the strip nears either end. */
const block = 30;
function dayBlock(first: ReportingDate, count: number): ReportingDate[] {
  const days = [first];
  while (days.length < count) days.push(addReportingDays(days.at(-1)!, 1));
  return days;
}
const smooth = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export function DayStrip({ query, today, onApply }: { query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void }) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today), anchor = range.startDate;
  const list = useRef<HTMLUListElement>(null), calendarButton = useRef<HTMLButtonElement>(null);
  // A tapped day is highlighted at once, before its matches arrive.
  const [chosen, setChosen] = useState<ReportingDate | null>(null), selected = chosen ?? (range.dayCount === 1 ? range.startDate : null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The strip has no first or last day: blocks of days are added as either end comes near. The server
  // list starts one day before the selection, so three visible days are already centred before scripts load.
  const [days, setDays] = useState(() => dayBlock(addReportingDays(anchor, -1), block + 2));
  const prepended = useRef(0), growing = useRef(false), centerAfter = useRef<ReportingDate | null>(null), handled = useRef(days);
  const selection = (date: ReportingDate): DateSelection => date === today ? { kind: "today" }
    : query.status !== "finished" && date === addReportingDays(today, 1) ? { kind: "tomorrow" } : { kind: "date", date };
  const center = useCallback((date: ReportingDate, behavior: ScrollBehavior) => {
    const strip = list.current, cell = strip?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (strip && cell) strip.scrollTo({ left: cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2, behavior });
  }, []);
  const extend = useCallback(() => {
    const strip = list.current;
    if (!strip || growing.current || strip.clientWidth === 0) return;
    if (strip.scrollLeft < strip.clientWidth) {
      growing.current = true; prepended.current = block;
      setDays((current) => [...dayBlock(addReportingDays(current[0]!, -block), block), ...current]);
    } else if (strip.scrollLeft + strip.clientWidth * 2 > strip.scrollWidth) {
      growing.current = true;
      setDays((current) => [...current, ...dayBlock(addReportingDays(current.at(-1)!, 1), block)]);
    }
  }, []);
  // Declared first, so on mount it runs before the extension below sets its flags.
  useLayoutEffect(() => {
    // Days added before the visible ones keep the same days in view. Each new list is handled once.
    if (handled.current === days) return;
    handled.current = days;
    const strip = list.current, cell = strip?.firstElementChild as HTMLElement | null;
    if (strip && cell && prepended.current) strip.scrollLeft += prepended.current * (cell.offsetWidth + 4);
    if (centerAfter.current) center(centerAfter.current, "auto");
    prepended.current = 0; growing.current = false; centerAfter.current = null;
  }, [center, days]);
  useLayoutEffect(() => {
    // Earlier days are added once scripts run, then the selection moves to the middle.
    if (!list.current?.clientWidth) return;
    centerAfter.current = anchor; extend();
  }, [anchor, extend]);
  /** Scrolls by whole days: a page of them, keeping one day from the previous view. */
  const page = (direction: -1 | 1) => {
    const strip = list.current, cell = strip?.firstElementChild as HTMLElement | null;
    if (!strip || !cell) return;
    const step = cell.offsetWidth + 4, visible = Math.round((strip.clientWidth + 4) / step);
    strip.scrollBy({ left: direction * Math.max(1, visible - 1) * step, behavior: smooth() });
  };
  const closeCalendar = () => { setCalendarOpen(false); calendarButton.current?.focus(); };
  const span = messages.reportingDateSpan(range.startDate, range.endDate);
  return <Strip aria-label={messages.text("feed.date.days")}>
    <Scroll type="button" aria-label={messages.text("feed.date.earlier")} title={messages.text("feed.date.earlier")} onClick={() => page(-1)}>
      <ChevronLeftIcon />
    </Scroll>
    <Days ref={list} onScroll={extend}>
      {days.map((date) => {
        const parts = messages.reportingDayParts(date);
        return <li key={date} data-date={date}>
          <Day href={feedQueryHref({ ...query, dates: selection(date), page: 1 }, today)} prefetch={false} scroll={false}
            aria-current={range.dayCount === 1 && date === range.startDate ? "date" : undefined} data-selected={date === selected || undefined}
            aria-label={date === today ? `${messages.text("feed.date.today")}, ${messages.reportingDate(date)}` : messages.reportingDate(date)}
            onClick={(event) => plainClick(event, () => {
              setChosen(date); center(date, smooth());
              onApply({ ...query, dates: selection(date), page: 1 });
            })}>
            <small data-today={date === today || undefined}>{messages.text("feed.date.dayMonth", { weekday: parts.weekday, month: parts.month })}</small>
            <b>{parts.day}</b>
          </Day>
        </li>;
      })}
    </Days>
    <Scroll type="button" aria-label={messages.text("feed.date.later")} title={messages.text("feed.date.later")} onClick={() => page(1)}>
      <ChevronRightIcon />
    </Scroll>
    <CalendarButton ref={calendarButton} type="button" data-current={selected === null || undefined}
      aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={() => setCalendarOpen(true)}
      aria-label={selected === null ? messages.text("feed.date.rangeCurrent", { range: span }) : messages.text("feed.date.rangeOpen")}>
      {selected === null ? <><small>{messages.text("feed.date.rangeShort")}</small><b>{span}</b></>
        : <><CalendarIcon /><small>{messages.text("feed.date.calendar")}</small></>}
    </CalendarButton>
    {calendarOpen && <DateCalendar locale={query.locale} today={today} from={range.startDate} to={range.endDate} onClose={closeCalendar}
      onApply={(from, to) => {
        setCalendarOpen(false);
        onApply({ ...query, dates: from === to ? selection(from) : { kind: "range", from, to }, page: 1 });
      }} />}
  </Strip>;
}
