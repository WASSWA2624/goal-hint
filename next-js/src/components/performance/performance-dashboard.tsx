"use client";

import { Suspense, use, type ReactNode } from "react";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { LoadingTheme } from "@/styles/loading-theme";
import type { PerformanceCell, PerformanceLeague, PerformanceResponse } from "@/domain/performance";
import type { PublishedSlipHistory } from "@/domain/published-slips";
import type { SlipPerformanceSummary } from "@/domain/slip-performance";
import type { PickPerformanceSummary } from "@/domain/pick-performance";
import { performancePageHref, type PerformancePageFilters } from "@/domain/performance-page";
import { performanceHref } from "@/domain/navigation";
import { isMarketSelection } from "@/domain/markets";
import { parseReportingDate } from "@/domain/calendar";
import { createMessages, type Messages } from "@/i18n/messages";
import { marketName, pickLabel } from "@/components/match/details/labels";
import { Button, ButtonLink, SelectInput, TextInput, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, DesktopInset, Inline, MutedText, PageHeading, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { SlipCard } from "@/components/slips/slip-card";
import { SlipList } from "@/components/slips/slip-styles";
import { PerformanceSummary } from "./performance-summary";
import { EvidenceList, MarketGrid, MetricList, PerformanceFilterPanel, PerformanceFilters, PerformanceSections, PerformanceTable, TableFrame } from "./performance-styles";

export type PerformanceDashboardProps = Readonly<{
  locale: string;
  filters: PerformancePageFilters;
  report: PerformanceResponse | null;
  history: PublishedSlipHistory | null;
  reportPromise?: Promise<PerformanceResponse | null>;
  historyPromise?: Promise<PublishedSlipHistory | null>;
  historyPage?: number;
}>;
const percent = (value: number | null, m: Messages) => value === null ? "—" : m.number(value, { style: "percent", maximumFractionDigits: 1 });
const metric = (value: number | null, m: Messages) => value === null ? "—" : m.number(value, { maximumFractionDigits: 3 });
function Metrics({ values }: { values: readonly Readonly<{ label: string; value: ReactNode }>[] }) {
  return <MetricList>{values.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</MetricList>;
}
function ReturnMetrics({ summary, locale, kind }: { summary: PickPerformanceSummary | SlipPerformanceSummary; locale: string; kind: "pick" | "slip" }) {
  const m = createMessages(locale), units = (value: number) => m.text("performance.units", { count: m.number(value, { maximumFractionDigits: 2 }) });
  return <Stack $gap="sm" data-return-performance={kind}>
    <Metrics values={[
      { label: m.text("performance.returnCount"), value: m.number(summary.returnsSampleCount) },
      { label: m.text("performance.stake"), value: summary.returnsSampleCount ? units(summary.stakeUnits) : "—" },
      { label: m.text("performance.returns"), value: summary.returnsSampleCount ? units(summary.returnUnits) : "—" },
      { label: m.text("performance.profit"), value: summary.returnsSampleCount ? units(summary.profitUnits) : "—" },
      { label: m.text("performance.roi"), value: percent(summary.roi, m) },
      { label: m.text("performance.meanOdds"), value: metric(summary.meanQuotedOdds, m) },
      { label: m.text("performance.longestLosing"), value: m.number(summary.longestLosingStreak) },
      { label: m.text("performance.currentLosing"), value: m.number(summary.currentLosingStreak) },
    ]} />
    <MutedText>{m.text(kind === "pick" ? "performance.pickReturnsHint" : "performance.returnsHint")}</MutedText>
    <MutedText>{m.text(kind === "pick" ? "performance.pickStreakHint" : "performance.streakHint")}</MutedText>
    {summary.returnsSampleCount === 0 && <MutedText>{m.text("performance.noReturnQuotes")}</MutedText>}
    {summary.excludedQuoteCount > 0 && <MutedText>{m.text(kind === "pick" ? "performance.excludedPickQuotes" : "performance.excludedQuotes",
      { count: m.number(summary.excludedQuoteCount) })}</MutedText>}
  </Stack>;
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
function PredictionCard({ cell, locale, period }: { cell: PerformanceCell; locale: string; period: string }) {
  const m = createMessages(locale), values = cell.metrics;
  return <Surface data-prediction-performance={cell.family}><Stack $gap="sm">
    <strong data-performance-market>{marketName(m, cell.family)}</strong>
    <PerformanceSummary counts={{ total: cell.coverage.total, won: values.correct, lost: values.incorrect,
      pending: cell.coverage.pending, void: cell.coverage.void, unavailable: cell.coverage.unavailable, filteredOut: cell.coverage.filteredOut }}
      locale={locale} period={period} kind="matches" headingLevel={3} />
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
    <details><summary>{m.text("performance.pickReturns")}</summary><ReturnMetrics summary={cell.returns} locale={locale} kind="pick" /></details>
    {cell.evidence.links.length > 0 && <details><summary>{m.text("performance.evidence")}</summary>
      <EvidenceList>{cell.evidence.links.map((link) => <li key={link.revisionId}><TextLink href={link.pageHref} prefetch={false}>{link.matchLabel}</TextLink></li>)}</EvidenceList>
    </details>}
  </Stack></Surface>;
}
function LeagueCard({ league, locale }: { league: PerformanceLeague; locale: string }) {
  const m = createMessages(locale), name = league.competition.name ?? m.text(league.competition.id === null ? "performance.unknownLeague" : "performance.unnamedLeague");
  return <Surface data-league-performance={league.competition.id ?? "unknown"}><details>
    <summary><strong>{name}</strong>{league.competition.country ? ` · ${league.competition.country}` : ""}
      {` · ${m.text("performance.fixtureCount")}: ${m.number(league.fixtureCount)}`}</summary>
    <Stack $gap="sm">
      <MutedText>{m.text("performance.qualityHint")}</MutedText>
      <TableFrame tabIndex={0} role="region" aria-label={`${name} — ${m.text("performance.pickHeading")}`}><PerformanceTable>
        <thead><tr>{(["market", "won", "lost", "pending", "void", "unavailable", "filteredOut", "settled", "hitRate", "leagueQuality"] as const).map((key) =>
          <th key={key} scope="col">{m.text(`performance.${key}`)}</th>)}</tr></thead>
        <tbody>{league.cells.map((cell) => <tr key={cell.family}>
          <th scope="row">{marketName(m, cell.family)}</th><td>{m.number(cell.metrics.correct)}</td><td>{m.number(cell.metrics.incorrect)}</td>
          <td>{m.number(cell.coverage.pending)}</td><td>{m.number(cell.coverage.void)}</td><td>{m.number(cell.coverage.unavailable)}</td>
          <td>{m.number(cell.coverage.filteredOut)}</td><td>{m.number(cell.metrics.denominator)}</td><td>{percent(cell.metrics.hitRate, m)}</td>
          <td>{m.text(cell.metrics.state === "available" ? "performance.leagueReviewed" : "performance.leagueWithheld")}</td>
        </tr>)}</tbody>
      </PerformanceTable></TableFrame>
    </Stack>
  </details></Surface>;
}
function SlipMetrics({ summary, locale, period }: { summary: SlipPerformanceSummary; locale: string; period: string }) {
  const m = createMessages(locale);
  return <Surface><Stack $gap="sm">
    <PerformanceSummary counts={summary} locale={locale} kind="slips" period={period} headingLevel={3} />
    <Metrics values={[
      { label: m.text("performance.slipSettled"), value: m.number(summary.settled) },
      { label: m.text("performance.slipWinRate"), value: percent(summary.winRate, m) },
    ]} />
    <MutedText>{m.text("performance.slipWinRateHint")}</MutedText>
    <ReturnMetrics summary={summary} locale={locale} kind="slip" />
  </Stack></Surface>;
}

const performancePeriod = (m: Messages, filters: PerformancePageFilters) =>
  `${m.reportingDateRangeCompact(parseReportingDate(filters.from), parseReportingDate(filters.to))} · EAT`;

type SectionProps = Pick<PerformanceDashboardProps, "locale" | "filters">;

/** Independent reads stream into their existing positions; filters and headings render immediately. */
export function PerformanceDashboard({ locale, filters, report, history, reportPromise, historyPromise, historyPage }: PerformanceDashboardProps) {
  const m = createMessages(locale), page = historyPage ?? history?.page ?? 1;
  return <PerformanceSections $gap="lg" data-performance-dashboard>
    <DesktopInset><PageHeading>{m.text("performance.title")}</PageHeading><BodyText>{m.text("performance.description")}</BodyText></DesktopInset>
    <PerformanceFilterPanel><Stack $gap="sm">
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
    </Stack></PerformanceFilterPanel>
    {reportPromise ? <Suspense fallback={<LoadingTheme><PredictionSections locale={locale} filters={filters} report={null} page={page} loading /></LoadingTheme>}>
      <ServerThemeUntilHydrated><StreamedPredictions locale={locale} filters={filters} read={reportPromise} page={page} /></ServerThemeUntilHydrated>
    </Suspense> : <PredictionSections locale={locale} filters={filters} report={report} page={page} />}
    {historyPromise ? <Suspense fallback={<LoadingTheme><HistorySection locale={locale} filters={filters} history={null} loading /></LoadingTheme>}>
      <ServerThemeUntilHydrated><StreamedHistory locale={locale} filters={filters} read={historyPromise} /></ServerThemeUntilHydrated>
    </Suspense> : <HistorySection locale={locale} filters={filters} history={history} />}
    <DesktopInset><MutedText>{m.text("performance.noGuarantee")}</MutedText></DesktopInset>
  </PerformanceSections>;
}

function StreamedPredictions({ read, ...props }: SectionProps & { read: Promise<PerformanceResponse | null>; page: number }) {
  return <PredictionSections {...props} report={use(read)} />;
}
function StreamedHistory({ read, ...props }: SectionProps & { read: Promise<PublishedSlipHistory | null> }) {
  return <HistorySection {...props} history={use(read)} />;
}
function PredictionSections({ locale, filters, report, page, loading = false }: SectionProps & {
  report: PerformanceResponse | null; page: number; loading?: boolean;
}) {
  const m = createMessages(locale), cells = report?.cells.filter((cell) => cell.horizon === null && cell.source === filters.source) ?? [];
  const leaguePages = report ? Math.ceil(report.leagues.totalGroups / report.leagues.pageSize) : 0;
  const leagueOutOfRange = Boolean(report && report.leagues.page > Math.max(1, leaguePages));
  const leagueHref = (next: number) => performancePageHref({ ...filters, leaguePage: next }, page, locale);
  return <>
    <DesktopInset as="section" aria-labelledby="individual-performance"><Stack>
      <SectionHeading id="individual-performance">{m.text("performance.pickHeading")}</SectionHeading><MutedText>{m.text("performance.pickBasis")}</MutedText>
      {loading ? <PerformanceSummary counts={null} locale={locale} kind="matches" period={performancePeriod(m, filters)} /> : report ? <>
        <Inline><strong>{m.text("performance.fixtureCount")}: {m.number(report.cohort.fixtureCount)}</strong></Inline>
        {report.cohort.fixtureCount === 0 ? <EmptyState headingLevel={3} title={m.text("performance.noPredictions")} />
          : <MarketGrid>{cells.map((cell) => <PredictionCard key={cell.family} cell={cell} locale={locale} period={performancePeriod(m, filters)} />)}</MarketGrid>}
      </> : <EmptyState headingLevel={3} title={m.text("performance.dataUnavailable")} />}
    </Stack></DesktopInset>
    {(report || loading) && <DesktopInset as="section" aria-labelledby="league-performance"><Stack>
      <SectionHeading id="league-performance">{m.text("performance.leagueHeading")}</SectionHeading><MutedText>{m.text("performance.leagueBasis")}</MutedText>
      {loading ? <PerformanceSummary counts={null} locale={locale} kind="matches" period={performancePeriod(m, filters)} /> : report!.leagues.records.length ? report!.leagues.records.map((league) => <LeagueCard key={league.competition.id ?? "unknown"} league={league} locale={locale} />)
        : <EmptyState headingLevel={3} title={m.text(leagueOutOfRange ? "performance.leaguePageUnavailable" : "performance.noLeagueGroups")}
          {...(leagueOutOfRange ? { action: <ButtonLink href={leagueHref(1)}>{m.text("performance.firstLeaguePage")}</ButtonLink> } : {})} />}
      {leaguePages > 1 && !leagueOutOfRange && <NumberedPagination page={report!.leagues.page} pages={leaguePages}
        labels={numberedPaginationLabels(m, m.text("performance.leaguePagination"))} href={leagueHref} />}
    </Stack></DesktopInset>}
  </>;
}
function HistorySection({ locale, filters, history, loading = false }: SectionProps & {
  history: PublishedSlipHistory | null; loading?: boolean;
}) {
  const m = createMessages(locale), pages = history ? Math.ceil(history.total / history.pageSize) : 0;
  const outOfRange = Boolean(history && history.page > Math.max(1, pages));
  const href = (page: number) => performancePageHref(filters, page, locale);
  return (
    <DesktopInset as="section" aria-labelledby="published-performance"><Stack>
      <SectionHeading id="published-performance">{m.text("performance.slipHeading")}</SectionHeading><MutedText>{m.text("performance.slipBasis")}</MutedText>
      {loading ? <PerformanceSummary counts={null} locale={locale} kind="slips" period={performancePeriod(m, filters)} /> : history?.statistics ? <SlipMetrics summary={history.statistics} locale={locale} period={performancePeriod(m, filters)} /> : <MutedText>{m.text("performance.statisticsUnavailable")}</MutedText>}
      {loading ? <MutedText role="status">{m.text("performance.summary.loading")}</MutedText> : history?.records.length ? <SlipList $inset={false} data-slip-list>{history.records.map((item) => <article key={item.id} data-published-slip={item.id}>
        <SlipCard slip={item.slip} index={item.rank - 1} estimatedProbability={item.estimatedProbability} results={item.results} locale={locale}
          publishedAt={Date.parse(item.publishedAt)} outcome={item.outcome} {...(item.status ? { status: item.status } : {})} />
      </article>)}</SlipList> : <EmptyState headingLevel={3} title={m.text(history === null ? "performance.historyUnavailable" : outOfRange ? "performance.pageUnavailable" : "performance.historyEmpty")}
        {...(outOfRange ? { action: <ButtonLink href={href(1)}>{m.text("performance.firstPage")}</ButtonLink> } : {})} />}
      {pages > 1 && !outOfRange && <NumberedPagination page={history!.page} pages={pages} labels={numberedPaginationLabels(m, m.text("performance.historyPagination"))} href={href} />}
    </Stack></DesktopInset>
  );
}
