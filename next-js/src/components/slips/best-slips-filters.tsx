"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { FloatingField } from "@/components/ui/floating-field";
import { SlidersIcon } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/select-menu";
import { bestSlipsQueryRules, defaultBestSlipsQuery, resolveBestSlipsDates, selectSlipSummaryResult, type BestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { addReportingDays, parseReportingDate, validateReportingDateRange, type ReportingDate } from "@/domain/calendar";
import type { PeriodPerformance } from "@/domain/browse-period";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages, type TextKey } from "@/i18n/messages";
import { bestSlipOddsBands, defaultBestSlipOddsBand, type BestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import { AdvancedFiltersButton, AppliedSelection, AppliedSummary, DateControls, DateError, DateFields, DateHint, FiltersPanel, PublicationDate } from "./best-slips-filter-styles";

const dateOptions = [
  ["last7", "feed.date.last-7-days"], ["last3", "feed.date.last-3-days"],
  ["last30", "feed.date.last-30-days"], ["yesterday", "feed.date.yesterday"], ["today", "feed.date.today"], ["tomorrow", "feed.date.tomorrow"],
  ["next3", "feed.date.next-3-days"], ["next7", "feed.date.next-7-days"], ["next30", "feed.date.next-30-days"],
  ["all", "bestSlips.filters.allDates"], ["custom", "bestSlips.filters.customDate"],
] as const satisfies readonly (readonly [BestSlipsQuery["period"], TextKey])[];

type FilterDraft = Readonly<{ query: BestSlipsQuery; from: string; to: string }>;
function filterDraft(query: BestSlipsQuery, today: ReportingDate): FilterDraft {
  const bounds = resolveBestSlipsDates(query, today);
  return { query, from: bounds.from ?? today, to: bounds.to ?? today };
}

/** One responsive opener; date and odds edits remain local until the dialog applies them. */
export function BestSlipsFilters({ query, appliedQuery = query, today, locale, busy = false, updating = false, statistics, summary, scannedDates, publicationDay, countSummary, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; entitled?: boolean; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
  appliedQuery?: BestSlipsQuery; updating?: boolean;
  summary?: PeriodPerformance | undefined; statistics?: PerformanceSummaryCounts | null | undefined; countSummary?: ReactNode;
  scannedDates?: BestSlipsDates | undefined;
  publicationDay?: ReportingDate | undefined;
}) {
  const m = createMessages(locale), prefix = useId();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(() => filterDraft(appliedQuery, today));
  const [issue, setIssue] = useState<TextKey | null>(null);
  const opener = useRef<HTMLButtonElement>(null), error = useRef<HTMLParagraphElement>(null);
  const dialogId = `${prefix}-filters`, errorId = `${prefix}-date-error`, hintId = `${prefix}-date-hint`;

  function openFilters() {
    setDraft(filterDraft(appliedQuery, today)); setIssue(null); setOpen(true);
  }
  function closeFilters() {
    setOpen(false); setIssue(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function invalid(key: TextKey) {
    setIssue(key);
    requestAnimationFrame(() => error.current?.focus());
  }
  function applyFilters() {
    const { cursor: _cursor, from: _from, to: _to, ...scope } = draft.query;
    void _cursor; void _from; void _to;
    let next: BestSlipsQuery = { ...scope, page: 1 };
    if (scope.period === "custom") {
      let from: ReportingDate, to: ReportingDate;
      try { from = parseReportingDate(draft.from); to = parseReportingDate(draft.to); }
      catch { invalid("bestSlips.filters.invalidDate"); return; }
      if (from > to) { invalid("bestSlips.filters.invalidRange"); return; }
      try { validateReportingDateRange(from, to, bestSlipsQueryRules.maximumDays); }
      catch { invalid("bestSlips.filters.rangeTooLong"); return; }
      next = { period: "custom", status: scope.status, oddsBand: scope.oddsBand ?? defaultBestSlipOddsBand, from, to, page: 1 };
    }
    onChange(next); closeFilters();
  }

  const bounds = resolveBestSlipsDates(appliedQuery, today);
  const summaryDates = summary ?? (appliedQuery.summary ? { from: addReportingDays(today, -1), to: addReportingDays(today, -1) } : bounds);
  const performancePeriod = summaryDates.from && summaryDates.to
    ? `${m.reportingDateRangeCompact(summaryDates.from, summaryDates.to)} · EAT` : m.text("bestSlips.filters.allDates");
  const browsingDates = appliedQuery.period === "all" ? scannedDates : bounds;
  const currentRange = browsingDates?.from && browsingDates.to ? `${m.reportingDateRangeCompact(browsingDates.from, browsingDates.to)} · EAT` : null;
  const periodLabel = m.text(dateOptions.find(([period]) => period === appliedQuery.period)![1]);
  const oddsLabel = bestSlipOddsBands.find(band => band.id === (appliedQuery.oddsBand ?? defaultBestSlipOddsBand))!.label;
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    <PerformanceSummary locale={locale} kind="slips" counts={statistics ?? null} period={performancePeriod}
      showCoverage={false} activeResult={query.status === "all" ? undefined : query.status}
      onResult={(result) => onChange(selectSlipSummaryResult(appliedQuery, result ?? "all"))} disabled={busy}
      resultAttributes={(result) => ({ "data-slip-result": result ?? "all" })}
      actions={<AdvancedFiltersButton ref={opener} type="button" disabled={busy} data-best-slips-filter-trigger
        aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={openFilters}>
        <SlidersIcon aria-hidden="true" />{m.text("feed.filters.advanced")}
      </AdvancedFiltersButton>} />
    <AppliedSummary data-best-slips-applied aria-live="polite" aria-atomic="true">
      {publicationDay && <PublicationDate data-best-slips-publication><time dateTime={publicationDay}>{m.reportingDateMedium(publicationDay)} · EAT</time></PublicationDate>}
      <AppliedSelection data-applied-selection>
        <span>{m.text("history.browsing")}: {periodLabel}{currentRange && ` · ${currentRange}`}</span>
        <span data-applied-result>{m.text(`bestSlips.filters.${appliedQuery.status}`)}</span>
        <span>{m.text("bestSlips.filters.oddsRange")}: {oddsLabel}</span>
        {updating && <span data-best-slips-updating>{m.text("bestSlips.filters.updating")}</span>}
      </AppliedSelection>
      {countSummary}
    </AppliedSummary>
    {open && <AdvancedFilterDialog id={dialogId} open={open} locale={locale}
      onApply={applyFilters} onCancel={closeFilters} applyDisabled={busy}
      onReset={() => { setDraft(filterDraft(defaultBestSlipsQuery(), today)); setIssue(null); }}
      closeLabel={m.text("slips.dialog.close", { section: m.text("bestSlips.filters.title") })}>
      <DateControls data-best-slips-dialog-fields>
        <SelectMenu value={draft.query.period} label={m.text("bestSlips.filters.slipDate")} data-slip-period-select
          options={dateOptions.map(([value, label]) => ({ value, label: m.text(label) }))}
          onValueChange={value => {
            const period = dateOptions.find(([period]) => period === value)![0];
            setDraft(current => ({ ...current, query: { period, status: current.query.status, oddsBand: current.query.oddsBand ?? defaultBestSlipOddsBand, page: 1 } }));
            setIssue(null);
          }} />
        {draft.query.period === "custom" && <div>
          <DateFields>
            <FloatingField label={m.text("feed.date.from")}><input id={`${prefix}-from`} type="date" value={draft.from}
              required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
              onChange={event => { setDraft(current => ({ ...current, from: event.target.value })); setIssue(null); }} /></FloatingField>
            <FloatingField label={m.text("feed.date.to")}><input id={`${prefix}-to`} type="date" value={draft.to}
              required aria-describedby={issue ? `${hintId} ${errorId}` : hintId} aria-invalid={issue !== null}
              onChange={event => { setDraft(current => ({ ...current, to: event.target.value })); setIssue(null); }} /></FloatingField>
          </DateFields>
          <DateHint id={hintId}>{m.text("bestSlips.filters.dateHint", { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateHint>
          {issue && <DateError id={errorId} ref={error} role="alert" tabIndex={-1}>{m.text(issue, { days: m.number(bestSlipsQueryRules.maximumDays) })}</DateError>}
        </div>}
        <SelectMenu value={draft.query.oddsBand ?? defaultBestSlipOddsBand} label={m.text("bestSlips.filters.oddsRange")} data-slip-odds-band
          options={bestSlipOddsBands.map(band => ({ value: band.id, label: band.label }))}
          onValueChange={value => setDraft(current => ({ ...current, query: { ...current.query, oddsBand: value as BestSlipOddsBand } }))} />
      </DateControls>
    </AdvancedFilterDialog>}
  </FiltersPanel>;
}
