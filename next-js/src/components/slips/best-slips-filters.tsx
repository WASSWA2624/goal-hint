"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { SegmentedChoice } from "@/components/ui/controls";
import { SlidersIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { resolveBestSlipsDates, selectSlipSummaryResult, type BestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { PeriodPerformance } from "@/domain/browse-period";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import { bestSlipOddsBands, defaultBestSlipOddsBand, type BestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import { AdvancedFiltersButton, AppliedSelection, AppliedSummary, FilterOptions, FiltersPanel } from "./best-slips-filter-styles";

/** Published slips share one odds draft; edits remain local until Apply. */
export function BestSlipsFilters({ query, appliedQuery = query, today, locale, busy = false, statistics, summary, scannedDates, countSummary, onChange }: {
  query: BestSlipsQuery; today: ReportingDate; locale: string; entitled?: boolean; busy?: boolean; onChange: (query: BestSlipsQuery) => void;
  appliedQuery?: BestSlipsQuery;
  summary?: PeriodPerformance | undefined; statistics?: PerformanceSummaryCounts | null | undefined; countSummary?: ReactNode;
  scannedDates?: BestSlipsDates | undefined;
}) {
  const m = createMessages(locale), prefix = useId();
  const desktop = useDesktopLayout();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<BestSlipOddsBand>(appliedQuery.oddsBand ?? defaultBestSlipOddsBand);
  const opener = useRef<HTMLButtonElement>(null);
  const dialogId = `${prefix}-filters`;

  function openFilters() {
    setDraft(appliedQuery.oddsBand ?? defaultBestSlipOddsBand); setOpen(true);
  }
  function closeFilters() {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function applyFilters() {
    onChange({ ...selectSlipSummaryResult(appliedQuery, appliedQuery.status), oddsBand: draft });
    closeFilters();
  }

  const bounds = resolveBestSlipsDates(appliedQuery, today);
  const performanceDates = bounds.from && bounds.to ? m.reportingDateRangeCompact(bounds.from, bounds.to) : m.text("bestSlips.filters.allDates");
  const performancePeriod = `${performanceDates} · EAT`;
  const asOf = summary?.asOf === undefined ? null : utcInstantFromEpochMilliseconds(summary.asOf);
  const desktopPerformancePeriod = asOf === null ? performancePeriod : `${performanceDates} · ${m.reportingTime(asOf)} EAT`;
  const browsingDates = appliedQuery.period === "all" ? scannedDates : bounds;
  const currentRange = browsingDates?.from && browsingDates.to ? `${m.reportingDateRangeCompact(browsingDates.from, browsingDates.to)} · EAT` : null;
  const oddsLabel = bestSlipOddsBands.find(band => band.id === (appliedQuery.oddsBand ?? defaultBestSlipOddsBand))!.label;
  return <FiltersPanel aria-label={m.text("bestSlips.filters.title")} aria-busy={busy} data-best-slips-filters>
    <PerformanceSummary locale={locale} kind="slips" title={m.text(bounds.from === today && bounds.to === today ? "bestSlips.performance.today" : "performance.summary.title")} counts={statistics ?? null} period={desktop ? desktopPerformancePeriod : performancePeriod}
      compactHeader showCoverage={false} activeResult={query.status === "all" ? undefined : query.status}
      onResult={(result) => onChange(selectSlipSummaryResult(appliedQuery, result ?? "all"))} disabled={busy}
      resultAttributes={(result) => ({ "data-slip-result": result ?? "all" })}
      actions={<AdvancedFiltersButton ref={opener} type="button" disabled={busy} data-best-slips-filter-trigger
        aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={openFilters}>
        <SlidersIcon aria-hidden="true" />{m.text("feed.filters.advanced")}
      </AdvancedFiltersButton>} />
    <AppliedSummary data-best-slips-applied aria-live="polite" aria-atomic="true">
      <AppliedSelection data-applied-selection>
        <span data-browse-scope="mobile">{currentRange ?? m.text("bestSlips.filters.allDates")}</span>
        <span data-browse-scope="desktop">{m.text("history.browsing")}: {currentRange ?? m.text("bestSlips.filters.allDates")}</span>
        <span data-applied-result data-browse-scope="desktop">{m.text(`bestSlips.filters.${appliedQuery.status}`)}</span>
        <span>{m.text("bestSlips.filters.oddsRange")}: {oddsLabel}</span>
      </AppliedSelection>
      {countSummary}
    </AppliedSummary>
    {open && <AdvancedFilterDialog id={dialogId} open={open} locale={locale}
      onApply={applyFilters} onCancel={closeFilters} applyDisabled={busy}
      onReset={() => setDraft(defaultBestSlipOddsBand)}
      closeLabel={m.text("slips.dialog.close", { section: m.text("bestSlips.filters.title") })}>
      <FilterOptions data-best-slips-dialog-fields>
        <SegmentedChoice value={draft} label={m.text("bestSlips.filters.oddsRange")}
          options={bestSlipOddsBands.map(band => ({ value: band.id, label: band.label }))} onValueChange={setDraft} />
      </FilterOptions>
    </AdvancedFilterDialog>}
  </FiltersPanel>;
}
