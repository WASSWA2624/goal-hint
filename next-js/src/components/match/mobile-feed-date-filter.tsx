"use client";

import { useId, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { CalendarIcon, ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { applyFeedDraft, selectFeedDates } from "@/domain/feed-controls";
import { feedDatePresets, isFeedDatePreset, resolveFeedDates, type DateSelection, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { DateRangePicker } from "./feed-dates";
import { controlFeedback, focusRing } from "./filter-parts";
import { keepFocusInSheet, SheetClose, SheetHeader, SheetScrim, sheetFrame, usePhoneSheet } from "./sheet-parts";

type DateDraft = { preset: FeedDatePreset | null; from: string; to: string };

function dateDraft(query: FeedQuery, today: ReportingDate): DateDraft {
  const range = resolveFeedDates(query, today);
  return { preset: isFeedDatePreset(query.dates.kind) ? query.dates.kind : null, from: range.startDate, to: range.endDate };
}

const Trigger = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 44px;
  padding: 6px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: 1.3;
  text-align: start;
  cursor: pointer;
  > span { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  > svg { flex: none; font-size: 0.875rem; }
  > svg:last-child { font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  &[aria-expanded="true"] { border-color: ${({ theme }) => theme.color.brand}; }
  ${controlFeedback}
  ${focusRing}
`;

const Frame = styled.div`
  ${sheetFrame}
  display: flex;
  > ${SheetHeader} { padding-inline-start: 10px; }
  ${media.desktop} { display: none; }
`;
const Body = styled.div`
  display: grid;
  gap: 10px;
  min-block-size: 0;
  padding: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  [data-range="dates"] input { min-block-size: 44px; }
`;
const Presets = styled.fieldset`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  > legend { margin-block-end: 8px; padding: 0; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const Preset = styled.button`
  min-inline-size: 0;
  min-block-size: 44px;
  padding: 6px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: 1.3;
  overflow-wrap: anywhere;
  cursor: pointer;
  &[aria-pressed="true"] { color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; }
  ${controlFeedback}
  ${focusRing}
`;
const Footer = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  flex: none;
  gap: 6px;
  padding: 8px 10px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > button {
    min-inline-size: 0; min-block-size: 44px; padding: 6px 12px;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder}; border-radius: 0;
    font: inherit; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; cursor: pointer;
    ${focusRing}
  }
  > button:last-child { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.gradient.action}; border-color: ${({ theme }) => theme.color.brand}; }
  > button:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; border-color: ${({ theme }) => theme.color.border}; cursor: not-allowed; }
`;

/** One phone date owner; presets and custom endpoints remain a local draft until Apply. */
export function MobileFeedDateFilter({ query, today, onApply }: {
  query: FeedQuery; today: ReportingDate; onApply: (query: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale), id = useId();
  const trigger = useRef<HTMLButtonElement>(null), sheet = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(() => dateDraft(query, today));
  const range = resolveFeedDates(query, today);
  const span = range.dayCount === 1 ? messages.reportingDateShort(range.startDate) : messages.reportingDateSpan(range.startDate, range.endDate);
  const label = isFeedDatePreset(query.dates.kind) ? messages.text(`feed.date.${query.dates.kind}`) : span;
  const title = query.status === "live" ? messages.text("feed.filters.liveToday")
    : `${messages.text("feed.date.choose")}: ${label} (${span})`;
  const next = useMemo(() => {
    try {
      const from = parseReportingDate(draft.from), to = parseReportingDate(draft.to);
      const dates: DateSelection = draft.preset ? { kind: draft.preset } : from === to ? { kind: "date", date: from } : { kind: "range", from, to };
      resolveFeedDates({ dates }, today);
      return applyFeedDraft(selectFeedDates(query, dates, today), today);
    } catch { return null; }
  }, [draft, query, today]);
  const close = () => {
    setOpen(false);
    setDraft(dateDraft(query, today));
    trigger.current?.focus();
  };
  usePhoneSheet(open, sheet, close);
  const apply = () => {
    if (!next) return;
    close();
    onApply(next);
  };
  return <>
    <Trigger ref={trigger} type="button" data-mobile-date-filter disabled={query.status === "live"}
      title={title} aria-label={title} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => { setDraft(dateDraft(query, today)); setOpen(true); }}>
      <CalendarIcon /><span>{label}</span><ChevronDownIcon />
    </Trigger>
    {open && <>
      <SheetScrim aria-hidden="true" onClick={close} />
      <Frame ref={sheet} id={id} data-mobile-date-editor role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
          else if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); apply(); }
          else keepFocusInSheet(event);
        }}>
        <SheetHeader>
          <h2 id={`${id}-title`}>{messages.text("feed.date.choose")}</h2>
          <SheetClose type="button" aria-label={messages.text("feed.calendar.close")} title={messages.text("feed.calendar.close")} onClick={close}><CloseIcon /></SheetClose>
        </SheetHeader>
        <Body>
          <Presets><legend>{messages.text("feed.date.presets")}</legend>
            {feedDatePresets.map((preset) => <Preset key={preset} type="button" aria-pressed={draft.preset === preset}
              onClick={() => {
                const selected = resolveFeedDates({ dates: { kind: preset } }, today);
                setDraft({ preset, from: selected.startDate, to: selected.endDate });
              }}>{messages.text(`feed.date.${preset}`)}</Preset>)}
          </Presets>
          <DateRangePicker query={query} today={today} from={draft.from} to={draft.to}
            onChange={(from, to) => setDraft({ preset: null, from, to })} />
        </Body>
        <Footer>
          <button type="button" onClick={close}>{messages.text("feed.calendar.cancel")}</button>
          <button type="button" disabled={next === null} onClick={apply}>{messages.text("feed.calendar.apply")}</button>
        </Footer>
      </Frame>
    </>}
  </>;
}
