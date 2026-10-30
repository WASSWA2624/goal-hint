"use client";

import { useId, useRef, useState } from "react";
import { CalendarIcon, ResetIcon } from "@/components/ui/icons";
import { bestSlipsQueryRules, defaultBestSlipsQuery, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { parseReportingDate, validateReportingDateRange, type ReportingDate } from "@/domain/calendar";
import { createMessages, type TextKey } from "@/i18n/messages";
import { AppliedSummary, DateButton, DateError, DateFields, DateGroup, DateHint, FiltersPanel,
  RangeButton, RangeDialog, ResetButton, ResultButton, ResultGroup, ToggleRow } from "./best-slips-filter-styles";

const dateOptions = [
  ["last30", "feed.date.last-30-days"], ["last7", "feed.date.last-7-days"], ["last3", "feed.date.last-3-days"],
  ["yesterday", "feed.date.yesterday"], ["today", "feed.date.today"], ["tomorrow", "feed.date.tomorrow"],
  ["next3", "feed.date.next-3-days"], ["next7", "feed.date.next-7-days"], ["next30", "feed.date.next-30-days"],
  ["custom", "bestSlips.filters.customRange"],
] as const satisfies readonly (readonly [BestSlipsQuery["period"], TextKey])[];
const results = ["all", "won", "lost", "pending"] as const;
type DateDraft = Readonly<{ from: string; to: string }>;

/** Desktop-only compact date/result controls; custom dates stay a local draft until Apply. */
export function BestSlipsFilters({ query, today, locale, entitled = false, busy = false, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; entitled?: boolean; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
}) {
  const m = createMessages(locale), prefix = useId();
  const [open, setOpen] = useState(false), [dates, setDates] = useState<DateDraft>({ from: today, to: today });
  const [issue, setIssue] = useState<TextKey | null>(null);
  const opener = useRef<HTMLElement | null>(null), error = useRef<HTMLParagraphElement>(null);
  const dialogId = `${prefix}-dates`, errorId = `${prefix}-date-error`, hintId = `${prefix}-date-hint`;

  function openDates(trigger: HTMLElement) {
    const bounds = resolveBestSlipsDates(query, today);
    opener.current = trigger;
    setDates({ from: bounds.from ?? today, to: bounds.to ?? today });
    setIssue(null); setOpen(true);
  }
  function closeDates() {
    setOpen(false); setIssue(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function changeStatus(status: BestSlipsQuery["status"]) {
    onChange({ period: query.period, status, page: 1,
      ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) });
  }
  function invalid(key: TextKey) {
    setIssue(key);
    requestAnimationFrame(() => error.current?.focus());
  }
  function applyDates() {
    let from: ReportingDate, to: ReportingDate;
    try { from = parseReportingDate(dates.from); to = parseReportingDate(dates.to); }
    catch { invalid("bestSlips.filters.invalidDate"); return; }
    if (from > to) { invalid("bestSlips.filters.invalidRange"); return; }
    try { validateReportingDateRange(from, to, bestSlipsQueryRules.maximumDays); }
    catch { invalid("bestSlips.filters.rangeTooLong"); return; }
    onChange({ period: "custom", status: query.status, from, to, page: 1 });
    closeDates();
  }

  const bounds = resolveBestSlipsDates(query, today);
  const currentRange = bounds.from && bounds.to ? bounds.from === bounds.to ? `${m.reportingDateMedium(bounds.from)} · EAT`
    : m.text("bestSlips.filters.dateRange", { from: m.reportingDateMedium(bounds.from), to: m.reportingDateMedium(bounds.to) }) : null;
  const periodLabel = m.text(dateOptions.find(([period]) => period === query.period)?.[1] ?? "bestSlips.filters.allDates");
  const compactLabel = (period: BestSlipsQuery["period"], label: TextKey) => period.startsWith("last")
    ? m.text("bestSlips.filters.lastDaysShort", { days: m.number(Number(period.slice(4))) })
    : period.startsWith("next") ? m.text("bestSlips.filters.nextDaysShort", { days: m.number(Number(period.slice(4))) })
      : period === "custom" ? m.text("bestSlips.filters.customShort") : m.text(label);
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    <ToggleRow data-slip-toggle-row>
    <DateGroup role="group" aria-label={m.text("bestSlips.filters.slipDate")} data-slip-dates>
      {dateOptions.map(([period, label]) => <DateButton key={period} type="button" data-slip-period={period}
        aria-label={m.text(label)} title={m.text(label)}
        aria-pressed={query.period === period} {...(period === "custom" ? { "aria-haspopup": "dialog" as const, "aria-controls": dialogId, "aria-expanded": open } : {})}
        onClick={(event) => period === "custom" ? openDates(event.currentTarget) : onChange({ period, status: query.status, page: 1 })}>
        <span data-label-full>{m.text(label)}</span><span data-label-compact aria-hidden="true">{compactLabel(period, label)}</span>
      </DateButton>)}
    </DateGroup>
      <ResultGroup role="group" aria-label={m.text("bestSlips.filters.result")}>
        {results.map((status) => <ResultButton key={status} type="button" $status={status} aria-pressed={query.status === status}
          onClick={() => changeStatus(status)} data-slip-result={status}>{m.text(`bestSlips.filters.${status}`)}</ResultButton>)}
      </ResultGroup>
      <ResetButton type="button" onClick={() => onChange(defaultBestSlipsQuery(entitled))}><ResetIcon />{m.text("slips.reset")}</ResetButton>
    </ToggleRow>
    <AppliedSummary data-best-slips-applied aria-live="polite" aria-atomic="true">
      <span>{m.text("bestSlips.filters.applied")}</span>
      {query.period === "custom" && currentRange ? <RangeButton type="button" onClick={(event) => openDates(event.currentTarget)}
      aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} aria-label={m.text("bestSlips.filters.editDates", { range: currentRange })}>
      <CalendarIcon />{currentRange}
      </RangeButton> : <span>{periodLabel}{currentRange && ` · ${currentRange}`}</span>}
      <span aria-hidden="true">·</span><span data-applied-result>{m.text(`bestSlips.filters.${query.status}`)}</span>
    </AppliedSummary>
    {open && <RangeDialog id={dialogId} group="best-slips-dates" open={open} title={m.text("bestSlips.filters.customRange")}
      onApply={applyDates} onCancel={closeDates} onReset={() => {
        const defaults = resolveBestSlipsDates(defaultBestSlipsQuery(entitled), today);
        setDates({ from: defaults.from ?? today, to: defaults.to ?? today }); setIssue(null);
      }}
      resetLabel={m.text("slips.reset")} applyLabel={m.text("bestSlips.filters.applyRange")}
      cancelLabel={m.text("slips.dialog.cancel")} closeLabel={m.text("slips.dialog.close", { section: m.text("bestSlips.filters.customRange") })}>
      <DateFields>
        <label htmlFor={`${prefix}-from`}>{m.text("feed.date.from")}<input id={`${prefix}-from`} type="date" value={dates.from}
          required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
          onChange={(event) => { setDates((current) => ({ ...current, from: event.target.value })); setIssue(null); }} /></label>
        <label htmlFor={`${prefix}-to`}>{m.text("feed.date.to")}<input id={`${prefix}-to`} type="date" value={dates.to}
          required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
          onChange={(event) => { setDates((current) => ({ ...current, to: event.target.value })); setIssue(null); }} /></label>
      </DateFields>
      <DateHint id={hintId}>{m.text("bestSlips.filters.dateHint", { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateHint>
      {issue && <DateError id={errorId} ref={error} role="alert" tabIndex={-1}>{m.text(issue, { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateError>}
    </RangeDialog>}
  </FiltersPanel>;
}
