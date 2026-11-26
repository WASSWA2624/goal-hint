"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { DateNavigationFilters, DateStrip } from "@/components/match/feed-dates";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { FilterDialogContent, FilterDialogSection, FilterFieldRow, FilterSection, FiltersDialog } from "@/components/ui/advanced-filter-dialog";
import { SegmentedChoice, SelectInput } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { MutedText } from "@/components/ui/layout";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { BestSlipsQueryError, bestSlipsPeriods, bestSlipsQueryRules, bestSlipsRangeFields, bestSlipsStatuses,
  bestSlipsPageSearch, defaultBestSlipsQuery, parseBestSlipsQuery, resolveBestSlipsDates, selectBestSlipsDates, selectSlipSummaryResult,
  type BestSlipsDates, type BestSlipsPeriod, type BestSlipsQuery, type BestSlipsRangeField, type BestSlipsStatus } from "@/domain/best-slips-query";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { PeriodPerformance } from "@/domain/browse-period";
import { formatProbabilityValue } from "@/domain/feed-query";
import { bestSlipsHref } from "@/domain/navigation";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { publicPolicy } from "@/domain/public-policy";
import { commitSlipNumber, type SlipNumericField } from "@/domain/slip-input-guards";
import { createMessages, type Messages } from "@/i18n/messages";
import { bestSlipBand, bestSlipOddsBands, defaultBestSlipOddsBand, type BestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import { AppliedSelection, AppliedSummary, FiltersPanel } from "./best-slips-filter-styles";
import { SlipNumericInput } from "./slip-numeric-input";

const periodLabels = {
  today: "feed.date.today", yesterday: "feed.date.yesterday", tomorrow: "feed.date.tomorrow",
  last3: "feed.date.last-3-days", last7: "feed.date.last-7-days", last30: "feed.date.last-30-days",
  next3: "feed.date.next-3-days", next7: "feed.date.next-7-days", next30: "feed.date.next-30-days",
  all: "bestSlips.filters.allDates", custom: "bestSlips.filters.customRange",
} as const satisfies Record<BestSlipsPeriod, Parameters<Messages["text"]>[0]>;
const numericFields = { probMin: "totalProbMin", probMax: "totalProbMax", matchesMin: "teamsMin", matchesMax: "teamsMax" } as const satisfies Record<BestSlipsRangeField, SlipNumericField>;

type Draft = { period: BestSlipsPeriod; status: BestSlipsStatus; oddsBand: BestSlipOddsBand; from: string; to: string }
  & Record<BestSlipsRangeField, string>;

function filterDraft(query: BestSlipsQuery, today: ReportingDate): Draft {
  const { from, to } = resolveBestSlipsDates(query, today);
  return { period: query.period, status: query.status, oddsBand: query.oddsBand ?? defaultBestSlipOddsBand,
    from: from ?? today, to: to ?? today, probMin: query.probMin === undefined ? "" : formatProbabilityValue(query.probMin),
    probMax: query.probMax === undefined ? "" : formatProbabilityValue(query.probMax),
    matchesMin: String(query.matchesMin ?? ""), matchesMax: String(query.matchesMax ?? "") };
}

function compileDraft(draft: Draft, today: ReportingDate): BestSlipsQuery {
  const fields = { ...draft };
  for (const field of bestSlipsRangeFields) {
    const parsed = commitSlipNumber(numericFields[field], fields[field]);
    if (!parsed.accepted) throw new BestSlipsQueryError("invalid-query");
    fields[field] = parsed.value;
  }
  return parseBestSlipsQuery(fields, today);
}

function rangeLabel(minimum: number | undefined, maximum: number | undefined, format: (value: number) => string) {
  if (minimum !== undefined && maximum !== undefined) return `${format(minimum)}–${format(maximum)}`;
  if (minimum !== undefined) return `≥${format(minimum)}`;
  if (maximum !== undefined) return `≤${format(maximum)}`;
  return null;
}

/** A single local draft and shared controls serve both layouts. */
export function BestSlipsFilters({ query, appliedQuery = query, today, locale, busy = false, statistics, summary, scannedDates, countSummary, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; entitled?: boolean; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
  appliedQuery?: BestSlipsQuery;
  summary?: PeriodPerformance | undefined; statistics?: PerformanceSummaryCounts | null | undefined; countSummary?: ReactNode;
  scannedDates?: BestSlipsDates | undefined;
}) {
  const m = createMessages(locale), prefix = useId();
  const desktop = useDesktopLayout();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(() => filterDraft(appliedQuery, today));
  const [resetKey, setResetKey] = useState(0);
  const opener = useRef<HTMLButtonElement>(null);
  const dialogId = `${prefix}-filters`;

  function openFilters() {
    setDraft(filterDraft(appliedQuery, today)); setOpen(true);
  }
  function closeFilters() {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }
  let compiled: BestSlipsQuery | undefined, applyError: string | undefined;
  if (open) try { compiled = compileDraft(draft, today); }
  catch (error) {
    const code = error instanceof BestSlipsQueryError ? error.code : "invalid-query";
    applyError = m.text(code === "invalid-date" ? "bestSlips.filters.invalidDate"
      : code === "range-too-large" ? "bestSlips.filters.rangeTooLong"
      : code === "invalid-range" ? (draft.period === "custom" && draft.from > draft.to ? "bestSlips.filters.invalidRange" : "slips.guard.range")
      : "bestSlips.filters.invalidNumbers", { days: m.number(bestSlipsQueryRules.maximumDays) });
  }
  function applyFilters() {
    if (!compiled) return;
    onChange(compiled);
    closeFilters();
  }

  function edit<Field extends keyof Draft>(field: Field, value: Draft[Field]) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function numericInput(field: BestSlipsRangeField, label: string, edge: "minimum" | "maximum") {
    return <SlipNumericInput name={field} field={numericFields[field]} locale={locale} value={draft[field]} feedbackKey={resetKey}
      label={m.text(edge === "minimum" ? "feed.filters.min" : "feed.filters.max")}
      aria-label={m.text(`feed.filters.${edge}`, { label })} onValueChange={value => edit(field, value)} />;
  }

  const bounds = resolveBestSlipsDates(appliedQuery, today);
  const todayScope = bounds.from === today && bounds.to === today;
  const performanceDates = bounds.from && bounds.to ? m.reportingDateRangeCompact(bounds.from, bounds.to) : m.text("bestSlips.filters.allDates");
  const performancePeriod = `${performanceDates} · EAT`;
  const asOf = summary?.asOf === undefined ? null : utcInstantFromEpochMilliseconds(summary.asOf);
  const desktopPerformancePeriod = asOf === null || !todayScope ? performancePeriod : `${performanceDates} · ${m.reportingTime(asOf)} EAT`;
  const browsingDates = appliedQuery.period === "all" ? scannedDates : bounds;
  const currentRange = browsingDates?.from && browsingDates.to ? m.reportingDateRangeCompact(browsingDates.from, browsingDates.to) : null;
  const oddsLabel = bestSlipBand(appliedQuery.oddsBand).label;
  const probabilityLabel = m.text("slips.averagePick"), matchCountLabel = m.text("bestSlips.filters.matchCount");
  const probabilityRange = rangeLabel(appliedQuery.probMin, appliedQuery.probMax,
    (value) => m.number(value / 100, { style: "percent", maximumFractionDigits: 3 }));
  const matchCountRange = rangeLabel(appliedQuery.matchesMin, appliedQuery.matchesMax, (value) => m.number(value));
  const selectDates = (from: ReportingDate, to: ReportingDate = from) => selectBestSlipsDates(appliedQuery, from, to, today);
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    <PerformanceSummary locale={locale} kind="slips" title={m.text(todayScope ? "bestSlips.performance.today" : "performance.summary.title")} counts={statistics ?? null} period={desktop ? desktopPerformancePeriod : performancePeriod}
      compactHeader showCoverage={false} activeResult={appliedQuery.status === "all" ? undefined : appliedQuery.status}
      onResult={(result) => onChange(selectSlipSummaryResult(appliedQuery, result ?? "all"))} disabled={busy}
      resultAttributes={(result) => ({ "data-slip-result": result ?? "all" })} />
    <DateStrip locale={locale} today={today} {...bounds} label={m.text("bestSlips.filters.slipDate")}
      filters={<DateNavigationFilters locale={locale} ref={opener} aria-disabled={busy} data-best-slips-filter-trigger
        dialogId={dialogId} open={open} onClick={() => { if (!busy) openFilters(); }} />}
      hrefForDay={date => `${bestSlipsHref(locale)}${bestSlipsPageSearch(selectDates(date))}`}
      onDatesChange={(from, to) => onChange(selectDates(from, to))} />
    <AppliedSummary data-best-slips-applied aria-live="polite" aria-atomic="true">
      <AppliedSelection data-applied-selection>
        <span data-browse-scope="mobile">{currentRange ?? m.text("bestSlips.filters.allDates")}</span>
        <span data-browse-scope="desktop">{m.text("history.browsing")}: {currentRange ?? m.text("bestSlips.filters.allDates")}</span>
        <span data-applied-result data-browse-scope={appliedQuery.status === "all" ? "desktop" : undefined}>{m.text(`bestSlips.filters.${appliedQuery.status}`)}</span>
        <span>{m.text("bestSlips.filters.oddsRange")}: {oddsLabel}</span>
        {probabilityRange && <span>{probabilityLabel} {probabilityRange}</span>}
        {matchCountRange && <span>{matchCountLabel} {matchCountRange}</span>}
      </AppliedSelection>
      {countSummary}
    </AppliedSummary>
    {open && <FiltersDialog id={dialogId} open={open} locale={locale}
      onApply={applyFilters} onCancel={closeFilters} applyDisabled={busy || !compiled} applyError={applyError}
      onReset={() => { setDraft(filterDraft(defaultBestSlipsQuery(), today)); setResetKey(key => key + 1); }}
      closeLabel={m.text("filters.close")}>
      <FilterDialogContent data-best-slips-dialog-fields>
        <FilterDialogSection><SegmentedChoice value={draft.oddsBand} label={m.text("bestSlips.filters.oddsRange")}
          options={bestSlipOddsBands.map(band => ({ value: band.id, label: band.label }))} onValueChange={band => edit("oddsBand", band)} />
          <MutedText>{m.text("bestSlips.filters.oddsGuide")}</MutedText>
        </FilterDialogSection>
        <FilterDialogSection><FilterFieldRow>
          <SelectInput label={m.text("bestSlips.filters.slipDate")} name="period" value={draft.period} data-slip-period-select
            onChange={event => edit("period", event.currentTarget.value as BestSlipsPeriod)}>
            {bestSlipsPeriods.map(period => <option key={period} value={period}>{m.text(periodLabels[period])}</option>)}
          </SelectInput>
          <SelectInput label={m.text("slips.header.status")} name="status" value={draft.status}
            onChange={event => edit("status", event.currentTarget.value as BestSlipsStatus)}>
            {bestSlipsStatuses.map(status => <option key={status} value={status}>{m.text(`bestSlips.filters.${status}`)}</option>)}
          </SelectInput>
        </FilterFieldRow>
        {draft.period === "custom" && <FilterSection>
          <FilterFieldRow>
            <DateTimeField key={`from-${resetKey}`} mode="date" name="from" label={m.text("slips.dateFrom")} locale={locale}
              timeZone={publicPolicy.reportingTimeZone} value={draft.from} required onValueChange={from => edit("from", from)} />
            <DateTimeField key={`to-${resetKey}`} mode="date" name="to" label={m.text("slips.dateTo")} locale={locale}
              timeZone={publicPolicy.reportingTimeZone} value={draft.to} required onValueChange={to => edit("to", to)} />
          </FilterFieldRow>
          <MutedText>{m.text("bestSlips.filters.dateHint", { days: m.number(bestSlipsQueryRules.maximumDays) })}</MutedText>
        </FilterSection>}
        </FilterDialogSection>
        <FilterDialogSection><FilterSection>
          <legend>{m.text("bestSlips.filters.averageProbability")}</legend>
          <FilterFieldRow>{numericInput("probMin", probabilityLabel, "minimum")}{numericInput("probMax", probabilityLabel, "maximum")}</FilterFieldRow>
        </FilterSection></FilterDialogSection>
        <FilterDialogSection><FilterSection>
          <legend>{matchCountLabel}</legend>
          <FilterFieldRow>{numericInput("matchesMin", matchCountLabel, "minimum")}{numericInput("matchesMax", matchCountLabel, "maximum")}</FilterFieldRow>
        </FilterSection></FilterDialogSection>
      </FilterDialogContent>
    </FiltersDialog>}
  </FiltersPanel>;
}
