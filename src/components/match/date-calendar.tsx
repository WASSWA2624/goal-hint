"use client";

import { useId, useRef, useState } from "react";
import styled from "styled-components";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/ui/icons";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { feedQueryRules, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { focusRing } from "./filter-parts";
import { keepFocusInSheet, SheetClose, SheetHeader, SheetScrim, sheetFrame, usePhoneSheet } from "./sheet-parts";

const dayMilliseconds = 86_400_000;
const time = (date: ReportingDate) => Date.parse(`${date}T00:00:00Z`);
const monthOf = (date: ReportingDate) => parseReportingDate(`${date.slice(0, 7)}-01`);
/** Inclusive number of days from `from` to `to`. */
const spanDays = (from: ReportingDate, to: ReportingDate) => Math.round((time(to) - time(from)) / dayMilliseconds) + 1;
function shiftMonth(month: ReportingDate, offset: number): ReportingDate {
  const value = new Date(time(month));
  value.setUTCMonth(value.getUTCMonth() + offset);
  return parseReportingDate(value.toISOString().slice(0, 10));
}
/** Monday-first weeks; blanks pad the days before the first of the month. */
function monthCells(month: ReportingDate): { lead: ReportingDate; cells: (ReportingDate | null)[] } {
  const offset = (new Date(time(month)).getUTCDay() + 6) % 7, cells: (ReportingDate | null)[] = Array.from({ length: offset }, () => null);
  for (let date = month; date.slice(0, 7) === month.slice(0, 7); date = addReportingDays(date, 1)) cells.push(date);
  return { lead: addReportingDays(month, -offset), cells };
}

const Frame = styled.div`
  ${sheetFrame}
  display: flex;
  ${media.desktop} { display: none; }
`;
const Body = styled.div`
  display: grid;
  gap: 6px;
  min-block-size: 0;
  padding: 8px 14px 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
`;
const MonthBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 4px;
  > h3 { margin: 0; font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
`;
const BarButton = styled.button`
  display: inline-grid;
  place-items: center;
  min-inline-size: 2.5rem;
  min-block-size: 2.5rem;
  padding-inline: 8px;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  > svg { font-size: 1.125rem; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; } }
  ${focusRing}
`;
const Weekdays = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-align: center;
`;
/** Columns touch, so a selected range reads as one continuous band. */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  row-gap: 2px;
`;
const DayButton = styled.button`
  min-inline-size: 0;
  min-block-size: 2.5rem;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 0;
  border-radius: 0;
  font: inherit;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  ${media.hover} { &:hover:not([aria-pressed="true"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  &[aria-current="date"] {
    color: ${({ theme }) => theme.color.accent.teal.text};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.brand};
  }
  &[data-in-range] { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft}; }
  &[data-endpoint] {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    box-shadow: none;
  }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
`;
const Summary = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.4;
  > small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const Footer = styled.div`
  display: flex;
  flex: none;
  gap: 8px;
  padding: 8px 14px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > button {
    min-block-size: 2.75rem;
    padding-inline: 12px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: 0;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    cursor: pointer;
    ${focusRing}
  }
  > button:last-child { flex: 1; color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.gradient.action}; border-color: ${({ theme }) => theme.color.brand}; }
`;

/**
 * Month calendar in a phone sheet. The first tap picks a day; a later tap within 31 days ends a
 * range, and any other tap starts again. Apply with one day picked selects that day.
 */
export function DateCalendar({ locale, today, from, to, onApply, onClose }: {
  locale: FeedQuery["locale"]; today: ReportingDate; from: ReportingDate; to: ReportingDate;
  onApply: (from: ReportingDate, to: ReportingDate) => void; onClose: () => void;
}) {
  const messages = createMessages(locale), sheet = useRef<HTMLDivElement>(null), titleId = useId();
  const [month, setMonth] = useState(() => monthOf(from));
  const [start, setStart] = useState(from), [end, setEnd] = useState<ReportingDate | null>(to);
  usePhoneSheet(true, sheet, onClose);
  const choose = (date: ReportingDate) => {
    if (end === null && date >= start && spanDays(start, date) <= feedQueryRules.maximumDays) setEnd(date);
    else { setStart(date); setEnd(null); }
  };
  const { lead, cells } = monthCells(month);
  const summary = end === null ? <>{messages.reportingDateShort(start)}<small>{messages.text("feed.calendar.pickEnd")}</small></>
    : start === end ? <>{messages.reportingDate(start)}<small>{messages.text("feed.calendar.limit")}</small></>
    : <>{messages.reportingDateSpan(start, end)} · {messages.plural("feed.calendar.days", spanDays(start, end))}<small>{messages.text("feed.calendar.limit")}</small></>;
  return <>
    <SheetScrim aria-hidden="true" onClick={onClose} />
    <Frame ref={sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      else keepFocusInSheet(event);
    }}>
      <SheetHeader>
        <h2 id={titleId}>{messages.text("feed.calendar.title")}</h2>
        <SheetClose type="button" aria-label={messages.text("feed.calendar.close")} title={messages.text("feed.calendar.close")} onClick={onClose}>
          <CloseIcon />
        </SheetClose>
      </SheetHeader>
      <Body>
        <MonthBar>
          <h3 aria-live="polite">{messages.reportingMonth(month)}</h3>
          <BarButton type="button" aria-label={messages.text("feed.calendar.thisMonthLabel")} onClick={() => setMonth(monthOf(today))}>
            {messages.text("feed.calendar.thisMonth")}
          </BarButton>
          <BarButton type="button" aria-label={messages.text("feed.calendar.previousMonth")} title={messages.text("feed.calendar.previousMonth")}
            onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeftIcon /></BarButton>
          <BarButton type="button" aria-label={messages.text("feed.calendar.nextMonth")} title={messages.text("feed.calendar.nextMonth")}
            onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRightIcon /></BarButton>
        </MonthBar>
        <Weekdays aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <span key={index}>{messages.reportingDayParts(addReportingDays(lead, index)).weekday}</span>)}
        </Weekdays>
        <Grid>
          {cells.map((date, index) => {
            if (date === null) return <span key={`blank-${index}`} />;
            const endpoint = date === start || date === end, inRange = end !== null && date > start && date < end;
            return <DayButton key={date} type="button" aria-pressed={endpoint || inRange} aria-current={date === today ? "date" : undefined}
              data-endpoint={endpoint || undefined} data-in-range={inRange || undefined} aria-label={messages.reportingDate(date)}
              onClick={() => choose(date)}>{messages.reportingDayParts(date).day}</DayButton>;
          })}
        </Grid>
        <Summary role="status" aria-live="polite">{summary}</Summary>
      </Body>
      <Footer>
        <button type="button" onClick={onClose}>{messages.text("feed.calendar.cancel")}</button>
        <button type="button" onClick={() => onApply(start, end ?? start)}>{messages.text("feed.calendar.apply")}</button>
      </Footer>
    </Frame>
  </>;
}
