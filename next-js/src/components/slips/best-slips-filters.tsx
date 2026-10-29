"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { CalendarIcon } from "@/components/ui/icons";
import { bestSlipsQueryRules, defaultBestSlipsQuery, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { parseReportingDate, validateReportingDateRange, type ReportingDate } from "@/domain/calendar";
import { createMessages, type TextKey } from "@/i18n/messages";
import { DateError, DateFields, DateHint, FilterButton, FiltersPanel, FiltersRow, PeriodLabel, PeriodSelect,
  RangeButton, RangeDialog, ResetButton, ResultGroup } from "./best-slips-filter-styles";

const dateOptions = [
  ["today", "feed.date.today"], ["yesterday", "feed.date.yesterday"], ["tomorrow", "feed.date.tomorrow"],
  ["last3", "feed.date.last-3-days"], ["last7", "feed.date.last-7-days"], ["last30", "feed.date.last-30-days"],
  ["next7", "feed.date.next-7-days"], ["next30", "feed.date.next-30-days"],
  ["all", "bestSlips.filters.allDates"], ["custom", "bestSlips.filters.customRange"],
] as const satisfies readonly (readonly [BestSlipsQuery["period"], TextKey])[];
const results = ["all", "won", "lost", "pending"] as const;
type DateDraft = Readonly<{ from: string; to: string }>;

/** Desktop-only compact date/result controls; custom dates stay a local draft until Apply. */
export function BestSlipsFilters({ query, today, locale, busy = false, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
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
  function choosePeriod(event: ChangeEvent<HTMLSelectElement>) {
    const period = event.currentTarget.value as BestSlipsQuery["period"];
    if (period === "custom") openDates(event.currentTarget);
    else onChange({ period, status: query.status, page: 1 });
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

  const currentRange = query.period === "custom" && query.from && query.to
    ? `${m.reportingDateMedium(query.from)} – ${m.reportingDateMedium(query.to)} · EAT` : null;
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    <FiltersRow>
      <PeriodLabel htmlFor={`${prefix}-period`}>{m.text("bestSlips.filters.slipDate")}
        <PeriodSelect id={`${prefix}-period`} value={query.period} onChange={choosePeriod} data-slip-period>
          {dateOptions.map(([value, label]) => <option key={value} value={value}>{m.text(label)}</option>)}
        </PeriodSelect>
      </PeriodLabel>
      <ResultGroup role="group" aria-label={m.text("bestSlips.filters.result")}>
        {results.map((status) => <FilterButton key={status} type="button" aria-pressed={query.status === status}
          onClick={() => changeStatus(status)} data-slip-result={status}>{m.text(`bestSlips.filters.${status}`)}</FilterButton>)}
      </ResultGroup>
      <ResetButton type="button" onClick={() => onChange(defaultBestSlipsQuery())}>{m.text("slips.reset")}</ResetButton>
    </FiltersRow>
    {currentRange && <FiltersRow><RangeButton type="button" onClick={(event) => openDates(event.currentTarget)}
      aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} aria-label={m.text("bestSlips.filters.editDates", { range: currentRange })}>
      <CalendarIcon />{currentRange}
    </RangeButton></FiltersRow>}
    {open && <RangeDialog id={dialogId} group="best-slips-dates" open={open} title={m.text("bestSlips.filters.customRange")}
      onApply={applyDates} onCancel={closeDates} onReset={() => { setDates({ from: today, to: today }); setIssue(null); }}
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
