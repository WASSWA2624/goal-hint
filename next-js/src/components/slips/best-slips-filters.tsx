"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { CalendarIcon, ResetIcon } from "@/components/ui/icons";
import { bestSlipsQueryRules, defaultBestSlipsQuery, resolveBestSlipsDates, selectSlipSummaryResult, type BestSlipsQuery } from "@/domain/best-slips-query";
import { parseReportingDate, validateReportingDateRange, type ReportingDate } from "@/domain/calendar";
import type { PeriodPerformance } from "@/domain/browse-period";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages, type TextKey } from "@/i18n/messages";
import { bestSlipOddsBands, defaultBestSlipOddsBand, type BestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import { AppliedDetails, AppliedSelection, AppliedSummary, DateControls, DateError, DateFields, DateHint, DateSelect, FiltersPanel,
  RangeButton, RangeDialog, ResetButton, ResultButton, ResultGroup, ToggleRow } from "./best-slips-filter-styles";

const dateOptions = [
  ["last7", "feed.date.last-7-days"], ["last3", "feed.date.last-3-days"],
  ["last30", "feed.date.last-30-days"], ["yesterday", "feed.date.yesterday"], ["today", "feed.date.today"], ["tomorrow", "feed.date.tomorrow"],
  ["next3", "feed.date.next-3-days"], ["next7", "feed.date.next-7-days"],
] as const satisfies readonly (readonly [BestSlipsQuery["period"], TextKey])[];
const results = ["all", "won", "lost", "pending", "void", "cancelled"] as const;
type DateDraft = Readonly<{ from: string; to: string }>;

/** Reveal keyboard focus inside the status rail without moving the page. */
function revealResultToggle({ currentTarget, target }: FocusEvent<HTMLDivElement>) {
  const control = target.closest<HTMLElement>("[data-slip-result]");
  if (!control) return;
  const rail = currentTarget.getBoundingClientRect(), bounds = control.getBoundingClientRect();
  const left = rail.left + 3, right = rail.right - 3;
  const offset = bounds.right > right ? bounds.right - right : bounds.left < left ? bounds.left - left : 0;
  if (offset) currentTarget.scrollLeft += offset;
}

/** Responsive date/result controls; custom dates stay a local draft until Apply. */
export function BestSlipsFilters({ query, appliedQuery = query, today, locale, busy = false, updating = false, statistics, summary, countSummary, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; entitled?: boolean; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
  appliedQuery?: BestSlipsQuery; updating?: boolean;
  summary?: PeriodPerformance | undefined; statistics?: PerformanceSummaryCounts | null | undefined; countSummary?: ReactNode;
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
    onChange(selectSlipSummaryResult(appliedQuery, status));
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
    onChange({ period: "custom", status: query.status, oddsBand: query.oddsBand ?? defaultBestSlipOddsBand, from, to, page: 1 });
    closeDates();
  }

  const bounds = resolveBestSlipsDates(appliedQuery, today);
  const currentRange = bounds.from && bounds.to ? bounds.from === bounds.to ? `${m.reportingDateMedium(bounds.from)} · EAT`
    : m.text("bestSlips.filters.dateRange", { from: m.reportingDateMedium(bounds.from), to: m.reportingDateMedium(bounds.to) }) : null;
  const periodLabel = m.text(dateOptions.find(([period]) => period === appliedQuery.period)?.[1]
    ?? (appliedQuery.period === "last30" ? "feed.date.last-30-days" : appliedQuery.period === "next30" ? "feed.date.next-30-days" : "bestSlips.filters.allDates"));
  const selectOptions = [{ value: "custom", label: m.text("bestSlips.filters.customDate") }, ...dateOptions.map(([value, label]) => ({ value, label: m.text(label) }))];
  const currentPeriodLabel = m.text(query.period === "custom" ? "bestSlips.filters.customRange"
    : query.period === "last30" ? "feed.date.last-30-days" : query.period === "next30" ? "feed.date.next-30-days" : "bestSlips.filters.allDates");
  const selectablePeriod = query.period === "custom" || dateOptions.some(([period]) => period === query.period);
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    {summary && <DateHint data-performance-period>{m.text(appliedQuery.summary ? "history.yesterday" : "history.performance")}
      {summary.from && summary.to && <> · {m.reportingDateMedium(summary.from)}{summary.from !== summary.to && ` – ${m.reportingDateMedium(summary.to)}`} · EAT</>}
    </DateHint>}
    <ToggleRow data-slip-toggle-row>
      <ResultGroup role="group" aria-label={m.text("bestSlips.filters.result")} onFocusCapture={revealResultToggle}>
        {results.map((status) => {
          const value = statistics ? status === "all" ? statistics.total : statistics[status] ?? 0 : null;
          const count = value === null ? "—" : m.number(value);
          const percentage = status === "all" ? null : statistics && value !== null
            ? m.number(statistics.total > 0 ? value / statistics.total : 0, { style: "percent", maximumFractionDigits: 1 }) : "—";
          return <ResultButton key={status} type="button" $status={status} aria-pressed={query.status === status}
            aria-label={m.text(percentage === null ? "bestSlips.filters.resultCount" : "bestSlips.filters.resultShare",
              { result: m.text(`bestSlips.filters.${status}`), count, ...(percentage === null ? {} : { percentage }) })}
            title={statistics ? m.text("bestSlips.filters.countScope") : m.text("bestSlips.filters.countUnavailable")}
            onClick={() => changeStatus(status)} data-slip-result={status}>
            <span>{m.text(status === "all" ? "bestSlips.filters.allShort" : `bestSlips.filters.${status}`)}</span>
            <strong data-slip-result-count={status}>{count}</strong>
            {percentage !== null && <span data-slip-result-percent={status}>({percentage})</span>}
            {status === "all" && <span data-slip-result-percent="all" data-mobile-result-percent>
              ({statistics ? m.number(statistics.total > 0 ? 1 : 0, { style: "percent", maximumFractionDigits: 1 }) : "—"})
            </span>}
          </ResultButton>;
        })}
      </ResultGroup>
      <DateControls role="group" aria-label={m.text("bestSlips.filters.slipDate")} data-slip-dates>
        <DateSelect value={query.period} options={selectablePeriod ? selectOptions
          : [...selectOptions, { value: query.period, label: currentPeriodLabel, disabled: true }]}
          label={m.text("bestSlips.filters.slipDate")} data-slip-period-select data-slip-period={query.period}
          onOptionSelect={(value, trigger) => { if (value === "custom") openDates(trigger); }}
          onValueChange={(value) => {
            const option = dateOptions.find(([period]) => period === value);
            if (option) onChange({ period: option[0], status: query.status, oddsBand: query.oddsBand ?? defaultBestSlipOddsBand, page: 1 });
          }} />
        <DateSelect value={query.oddsBand ?? defaultBestSlipOddsBand} label={m.text("bestSlips.filters.oddsRange")}
          options={bestSlipOddsBands.map(band => ({ value: band.id, label: band.label }))} data-slip-odds-band
          onValueChange={value => {
            const { cursor: _cursor, ...scope } = query; void _cursor;
            onChange({ ...scope, oddsBand: value as BestSlipOddsBand, page: 1 });
          }} />
      </DateControls>
      <ResetButton type="button" onClick={() => onChange(defaultBestSlipsQuery())}><ResetIcon />{m.text("slips.reset")}</ResetButton>
    </ToggleRow>
    <AppliedSummary data-best-slips-applied aria-live="polite" aria-atomic="true">
      <AppliedDetails>
        <AppliedSelection data-applied-selection><span>{m.text("history.browsing")}:</span>
          {appliedQuery.period === "custom" && currentRange ? <RangeButton type="button" onClick={(event) => openDates(event.currentTarget)}
            aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} aria-label={m.text("bestSlips.filters.editDates", { range: currentRange })}>
            <CalendarIcon />{currentRange}
          </RangeButton> : <span>{periodLabel}{currentRange && ` · ${currentRange}`}</span>}
          <span aria-hidden="true">·</span><span data-applied-result>{m.text(`bestSlips.filters.${appliedQuery.status}`)}</span>
          {updating && <span data-best-slips-updating>{m.text("bestSlips.filters.updating")}</span>}
        </AppliedSelection>
      </AppliedDetails>
      {countSummary}
    </AppliedSummary>
    {open && <RangeDialog id={dialogId} group="best-slips-dates" open={open} title={m.text("bestSlips.filters.customRange")}
      onApply={applyDates} onCancel={closeDates} onReset={() => {
        const defaults = resolveBestSlipsDates(defaultBestSlipsQuery(), today);
        setDates({ from: defaults.from ?? today, to: defaults.to ?? today }); setIssue(null);
      }}
      resetLabel={m.text("slips.reset")} applyLabel={m.text("bestSlips.filters.applyRange")}
      cancelLabel={m.text("slips.dialog.cancel")} closeLabel={m.text("slips.dialog.close", { section: m.text("bestSlips.filters.customRange") })}>
      <DateFields>
        <FloatingField label={m.text("feed.date.from")}><input id={`${prefix}-from`} type="date" value={dates.from}
          required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
          onChange={(event) => { setDates((current) => ({ ...current, from: event.target.value })); setIssue(null); }} /></FloatingField>
        <FloatingField label={m.text("feed.date.to")}><input id={`${prefix}-to`} type="date" value={dates.to}
          required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
          onChange={(event) => { setDates((current) => ({ ...current, to: event.target.value })); setIssue(null); }} /></FloatingField>
      </DateFields>
      <DateHint id={hintId}>{m.text("bestSlips.filters.dateHint", { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateHint>
      {issue && <DateError id={errorId} ref={error} role="alert" tabIndex={-1}>{m.text(issue, { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateError>}
    </RangeDialog>}
  </FiltersPanel>;
}
