"use client";

import type { ReactNode } from "react";
import type { PerformanceCell, PerformanceResponse } from "@/domain/performance";
import type { PublishedSlipHistory } from "@/domain/published-slips";
import type { SlipPerformanceSummary } from "@/domain/slip-performance";
import { performancePageHref, type PerformancePageFilters } from "@/domain/performance-page";
import { performanceHref } from "@/domain/navigation";
import { isMarketSelection } from "@/domain/markets";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createMessages, type Messages } from "@/i18n/messages";
import { marketName, pickLabel } from "@/components/match/details/labels";
import { Button, ButtonLink, SelectInput, TextInput, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, Inline, MutedText, PageHeading, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { SlipTable } from "@/components/slips/slip-table";
import { EvidenceList, MarketGrid, MetricList, PerformanceFilters, PerformanceTable, PublicationHeader, TableFrame } from "./performance-styles";

export type PerformanceDashboardProps = Readonly<{
  locale: string;
  filters: PerformancePageFilters;
  report: PerformanceResponse | null;
  history: PublishedSlipHistory | null;
}>;
const percent = (value: number | null, m: Messages) => value === null ? "—" : m.number(value, { style: "percent", maximumFractionDigits: 1 });
const metric = (value: number | null, m: Messages) => value === null ? "—" : m.number(value, { maximumFractionDigits: 3 });
function Metrics({ values }: { values: readonly Readonly<{ label: string; value: ReactNode }>[] }) {
  return <MetricList>{values.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</MetricList>;
}
function Calibration({ cell, m }: { cell: PerformanceCell; m: Messages }) {
  const rows = cell.metrics.calibration.filter((row) => row.count > 0);
  if (cell.metrics.state !== "available" || !rows.length) return null;
  return <details><summary>{m.text("performance.calibration")}</summary>
    <TableFrame tabIndex={0} role="region" aria-label={m.text("performance.calibration")}><PerformanceTable>
      <thead><tr>{(["selection", "band", "samples", "meanProbability", "observedFrequency", "confidenceInterval"] as const).map((key) =>
        <th key={key} scope="col">{m.text(`performance.${key}`)}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.selection}-${index}`}>
        <th scope="row">{isMarketSelection(cell.family, row.selection) ? pickLabel(m, row.selection) : row.selection}</th>
        <td>{percent(row.lower, m)}–{percent(row.upper, m)}</td><td>{m.number(row.count)}</td>
        <td>{percent(row.meanProbability, m)}</td><td>{percent(row.observedFrequency, m)}</td>
        <td>{row.interval ? `${percent(row.interval.lower, m)}–${percent(row.interval.upper, m)}` : "—"}</td>
      </tr>)}</tbody>
    </PerformanceTable></TableFrame>
  </details>;
}
function PredictionCard({ cell, locale }: { cell: PerformanceCell; locale: string }) {
  const m = createMessages(locale), values = cell.metrics;
  return <Surface data-prediction-performance={cell.family}><Stack $gap="sm">
    <h3>{marketName(m, cell.family)}</h3>
    <Metrics values={[
      { label: m.text("performance.available"), value: m.number(cell.coverage.available) },
      { label: m.text("performance.won"), value: m.number(values.correct) },
      { label: m.text("performance.lost"), value: m.number(values.incorrect) },
      { label: m.text("performance.pending"), value: m.number(cell.coverage.pending) },
      { label: m.text("performance.void"), value: m.number(cell.coverage.void) },
      { label: m.text("performance.unavailable"), value: m.number(cell.coverage.unavailable) },
      { label: m.text("performance.filteredOut"), value: m.number(cell.coverage.filteredOut) },
    ]} />
    <strong>{m.text(values.state === "available" ? "performance.qualityAvailable" : "performance.qualityPending")}</strong>
    <Metrics values={[
      { label: m.text("performance.settled"), value: m.number(values.denominator) },
      { label: m.text("performance.hitRate"), value: percent(values.hitRate, m) },
      { label: m.text("performance.brier"), value: metric(values.brier, m) },
      { label: m.text("performance.logLoss"), value: metric(values.logLoss, m) },
      { label: m.text("performance.calibrationError"), value: percent(values.calibrationError, m) },
    ]} />
    {values.state !== "available" && <MutedText>{m.text("performance.qualityHint")}</MutedText>}
    {values.minimumSamples !== null && <MutedText>{m.text("performance.sampleMinimum", { count: m.number(values.minimumSamples) })}</MutedText>}
    <Calibration cell={cell} m={m} />
    {cell.evidence.links.length > 0 && <details><summary>{m.text("performance.evidence")}</summary>
      <EvidenceList>{cell.evidence.links.map((link) => <li key={link.revisionId}><TextLink href={link.pageHref} prefetch={false}>{link.matchLabel}</TextLink></li>)}</EvidenceList>
    </details>}
  </Stack></Surface>;
}
function SlipMetrics({ summary, locale }: { summary: SlipPerformanceSummary; locale: string }) {
  const m = createMessages(locale), units = (value: number) => m.text("performance.units", { count: m.number(value, { maximumFractionDigits: 2 }) });
  return <Surface><Stack $gap="sm">
    <Metrics values={[
      { label: m.text("performance.slipTotal"), value: m.number(summary.total) },
      { label: m.text("performance.won"), value: m.number(summary.won) },
      { label: m.text("performance.lost"), value: m.number(summary.lost) },
      { label: m.text("performance.void"), value: m.number(summary.void) },
      { label: m.text("performance.pending"), value: m.number(summary.pending) },
      { label: m.text("performance.slipSettled"), value: m.number(summary.settled) },
      { label: m.text("performance.slipWinRate"), value: percent(summary.winRate, m) },
    ]} />
    <MutedText>{m.text("performance.slipWinRateHint")}</MutedText>
    <Metrics values={[
      { label: m.text("performance.returnCount"), value: m.number(summary.returnsSampleCount) },
      { label: m.text("performance.stake"), value: units(summary.stakeUnits) },
      { label: m.text("performance.returns"), value: units(summary.returnUnits) },
      { label: m.text("performance.profit"), value: units(summary.profitUnits) },
      { label: m.text("performance.roi"), value: percent(summary.roi, m) },
      { label: m.text("performance.meanOdds"), value: metric(summary.meanQuotedOdds, m) },
      { label: m.text("performance.longestLosing"), value: m.number(summary.longestLosingStreak) },
      { label: m.text("performance.currentLosing"), value: m.number(summary.currentLosingStreak) },
    ]} />
    <MutedText>{m.text("performance.returnsHint")}</MutedText><MutedText>{m.text("performance.streakHint")}</MutedText>
    {summary.excludedQuoteCount > 0 && <MutedText>{m.text("performance.excludedQuotes", { count: m.number(summary.excludedQuoteCount) })}</MutedText>}
  </Stack></Surface>;
}

export function PerformanceDashboard({ locale, filters, report, history }: PerformanceDashboardProps) {
  const m = createMessages(locale), cells = report?.cells.filter((cell) => cell.horizon === null && cell.source === filters.source) ?? [];
  const pages = history ? Math.ceil(history.total / history.pageSize) : 0, outOfRange = Boolean(history && history.page > Math.max(1, pages));
  const href = (page: number) => performancePageHref(filters, page, locale);
  return <Stack $gap="lg" data-performance-dashboard>
    <div><PageHeading>{m.text("performance.title")}</PageHeading><BodyText>{m.text("performance.description")}</BodyText></div>
    <Surface><Stack $gap="sm">
      <PerformanceFilters action={performanceHref(locale)} method="get" aria-label={m.text("performance.filters")}>
        <TextInput label={m.text("performance.from")} name="from" type="date" required defaultValue={filters.from} />
        <TextInput label={m.text("performance.to")} name="to" type="date" required defaultValue={filters.to} />
        <SelectInput label={m.text("performance.market")} name="market" defaultValue={filters.market}>
          <option value="all">{m.text("performance.allMarkets")}</option>
          {(["match-result", "double-chance", "total-goals", "both-teams-to-score"] as const).map((family) => <option key={family} value={family}>{marketName(m, family)}</option>)}
        </SelectInput>
        <SelectInput label={m.text("performance.source")} name="source" defaultValue={filters.source}>
          <option value="combined">{m.text("performance.combined")}</option><option value="ai">{m.text("performance.ai")}</option>
          <option value="api-football">{m.text("performance.provider")}</option>
        </SelectInput>
        <Button type="submit">{m.text("performance.apply")}</Button>
      </PerformanceFilters>
      <MutedText>{m.text("performance.periodHint")}</MutedText><MutedText>{m.text("performance.pickFilterHint")}</MutedText>
    </Stack></Surface>
    <section aria-labelledby="individual-performance"><Stack>
      <SectionHeading id="individual-performance">{m.text("performance.pickHeading")}</SectionHeading><MutedText>{m.text("performance.pickBasis")}</MutedText>
      {report ? <>
        <Inline><strong>{m.text("performance.fixtureCount")}: {m.number(report.cohort.fixtureCount)}</strong>
          <MutedText>{m.text("performance.asOf", { date: m.reportingInstant(utcInstantFromEpochMilliseconds(report.asOf)) })}</MutedText></Inline>
        {report.cohort.fixtureCount === 0 ? <EmptyState headingLevel={3} title={m.text("performance.noPredictions")} />
          : <MarketGrid>{cells.map((cell) => <PredictionCard key={cell.family} cell={cell} locale={locale} />)}</MarketGrid>}
      </> : <EmptyState headingLevel={3} title={m.text("performance.dataUnavailable")} />}
    </Stack></section>
    <section aria-labelledby="published-performance"><Stack>
      <SectionHeading id="published-performance">{m.text("performance.slipHeading")}</SectionHeading><MutedText>{m.text("performance.slipBasis")}</MutedText>
      {history && <MutedText>{m.text("performance.asOf", { date: m.reportingInstant(utcInstantFromEpochMilliseconds(history.asOf)) })}</MutedText>}
      {history?.statistics ? <SlipMetrics summary={history.statistics} locale={locale} /> : <MutedText>{m.text("performance.statisticsUnavailable")}</MutedText>}
      {history?.records.length ? history.records.map((item) => <article key={item.id} data-published-slip={item.id}>
        <PublicationHeader><strong>{m.text(`slips.outcome.${item.outcome}`)}</strong><time dateTime={item.publishedAt}>
          {m.text("performance.publication", { date: m.reportingInstant(utcInstantFromEpochMilliseconds(Date.parse(item.publishedAt))) })}</time></PublicationHeader>
        <SlipTable slip={item.slip} index={item.rank - 1} estimatedProbability={item.estimatedProbability} results={item.results} locale={locale} />
      </article>) : <EmptyState headingLevel={3} title={m.text(history === null ? "performance.historyUnavailable" : outOfRange ? "performance.pageUnavailable" : "performance.historyEmpty")}
        {...(outOfRange ? { action: <ButtonLink href={href(1)}>{m.text("performance.firstPage")}</ButtonLink> } : {})} />}
      {pages > 1 && !outOfRange && <NumberedPagination page={history!.page} pages={pages} labels={numberedPaginationLabels(m, m.text("performance.historyPagination"))} href={href} />}
    </Stack></section>
    <MutedText>{m.text("performance.noGuarantee")}</MutedText>
  </Stack>;
}
