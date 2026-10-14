"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { analyticsFilterKeys, analyticsFilterLabels, analyticsRules, comparisonModes, reportParameters, type AnalyticsFilterKey,
  type AnalyticsReport, type AnalyticsSummary, type BreakdownKey, type BreakdownRow, type ComparisonMode, type LiveReport,
  type ReportQuery } from "@/domain/analytics";
import { analyticsPresets, bucketLabel, formatRange, presetRange, rangeDays, type AnalyticsPreset } from "@/domain/analytics-range";
import { analyticsDatasets, formatDuration } from "@/domain/analytics-datasets";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { BarList, ColumnChart, EmptyChart, Heatmap, SplitBar, TrendChart } from "./charts";
import { DataTable } from "./data-table";
import { Brand, BrandImage, Card, CardValue, Cards, Chip, Chips, Definitions, Delta, Field, FilterBar, Grid, HeaderButton, LiveList, LivePill, Main,
  Muted, Notice, PageTitle, Panel, PanelHeader, SegmentButton, Segmented, SeriesTable, SettingsRow, Shell, Skeleton, Tab, Tabs, ToolButton,
  TopActions, TopBar, TopBarContent, WidePanel } from "./dashboard-styles";

type Filters = Partial<Record<AnalyticsFilterKey, Readonly<{ value: string; label: string }>>>;
type Selection = Readonly<{ preset: AnalyticsPreset | "custom"; from: ReportingDate; to: ReportingDate }>;
type Load = Readonly<{ status: "loading" | "ready" | "error"; report: AnalyticsReport | null; message?: string; refreshing: boolean }>;
type Settings = Readonly<{ retention: { retentionDays: number; source: string; lastPurgedAt: string | null }; retentionChoices: readonly number[];
  collecting: boolean; geoSource: string; browserExcluded: boolean }>;

const integer = new Intl.NumberFormat("en");
const count = (value: number) => integer.format(Math.round(value));
const percent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
const axisCount = (value: number) => value >= 10_000 ? new Intl.NumberFormat("en", { notation: "compact" }).format(value) : count(value);

const trendMetrics = {
  visitors: { label: "Visitors", format: count, axis: axisCount, integer: true },
  visits: { label: "Visits", format: count, axis: axisCount, integer: true },
  pageviews: { label: "Page views", format: count, axis: axisCount, integer: true },
  avgVisitMs: { label: "Avg. visit", format: formatDuration, axis: formatDuration, integer: false },
  bounceRate: { label: "Bounce rate", format: percent, axis: percent, integer: false },
  conversions: { label: "Conversions", format: count, axis: axisCount, integer: true },
} as const;
type TrendMetric = keyof typeof trendMetrics;

const cards: readonly Readonly<{ key: keyof AnalyticsSummary; label: string; format: (value: number) => string; lowerIsBetter?: boolean; rate?: boolean }>[] = [
  { key: "visitors", label: "Unique visitors", format: count },
  { key: "visits", label: "Visits", format: count },
  { key: "pageviews", label: "Page views", format: count },
  { key: "pagesPerVisit", label: "Pages per visit", format: (value) => value.toFixed(2) },
  { key: "avgVisitMs", label: "Avg. visit duration", format: formatDuration },
  { key: "bounceRate", label: "Bounce rate", format: percent, lowerIsBetter: true, rate: true },
  { key: "avgPageMs", label: "Avg. time on page", format: formatDuration },
  { key: "newVisitors", label: "New visitors", format: count },
  { key: "returningVisitors", label: "Returning visitors", format: count },
  { key: "conversions", label: "Conversions", format: count },
  { key: "conversionRate", label: "Conversion rate", format: percent, rate: true },
];

const sections: readonly Readonly<{ id: string; title: string; tabs: readonly BreakdownKey[] }>[] = [
  { id: "content", title: "Popular content", tabs: ["pages", "routes", "entries", "exits"] },
  { id: "paths", title: "Navigation paths", tabs: ["transitions", "journeys"] },
  { id: "acquisition", title: "Traffic sources", tabs: ["channels", "referrers", "campaigns"] },
  { id: "audience", title: "Audience and technology", tabs: ["countries", "cities", "devices", "browsers", "os", "languages", "screens", "frequency", "loyalty"] },
  { id: "interactions", title: "Clicks, searches and conversions", tabs: ["conversions", "clicks", "outbound", "searches", "downloads"] },
];

const definitions: readonly (readonly [string, string])[] = [
  ["Unique visitors", "Distinct browsers with at least one visit starting in the period. A browser is identified by a random ID kept in local storage after consent, so clearing storage or switching device counts as a new visitor."],
  ["Visits", "Sessions starting in the period (total visitors). A visit ends after 30 minutes without activity; opening a campaign-tagged link starts a new one."],
  ["Page views", "Pages displayed in the period, including in-app navigation. Query strings and fragments are dropped."],
  ["Pages per visit", "Page views of visits starting in the period divided by those visits."],
  ["Avg. visit duration", "Time from a visit's first page view to its last recorded activity (engagement heartbeats included), or its engaged time if longer."],
  ["Avg. time on page", "Engaged time per page view: the page is visible and the visitor has interacted within the last five minutes."],
  ["Bounce rate", "Share of visits that were not engaged: one page view, under 10 seconds engaged and no conversion."],
  ["New / returning visitors", "New visitors had their first-ever visit in the period. Returning visitors had a visit in the period after an earlier one; a visitor can be both."],
  ["Visit frequency", "Visits per visitor within the period, and each visit's lifetime visit number for that browser."],
  ["Live visitors", "Distinct visitors with activity in the last five minutes; visible pages report every 30 seconds."],
  ["Conversions", "Goals reached, counted once per visit: opening a match analysis, building a slip, following a source link or searching matches. Conversion rate is converted visits divided by visits."],
  ["Clicks, searches, downloads", "Link and button labels (never typed text), match search terms with emails and long numbers redacted, outbound domains and downloaded files."],
  ["Sources and campaigns", "Channel from UTM tags, then ad click identifiers (reduced to the network), then the referring domain; no referrer means Direct."],
  ["Location and technology", "Country and city are approximate: from the browser's time zone, or a trusted edge header when configured. Browser, OS and device come from the user agent, which is not stored."],
  ["Who is counted", "Only browsers that allowed analytics. Global Privacy Control, Do Not Track, bots, automated browsers and signed-in or previously signed-in administrators are excluded."],
  ["Dates and comparisons", "Days run in East Africa Time. Comparisons use the preceding period of equal length or the same dates a year earlier."],
];

function readUrlState(today: ReportingDate): { selection: Selection; compare: ComparisonMode; filters: Filters } {
  const parameters = new URLSearchParams(window.location.search);
  const preset = parameters.get("period");
  let selection: Selection = { preset: "last-30", ...presetRange("last-30", today) };
  if (preset && preset in analyticsPresets) selection = { preset: preset as AnalyticsPreset, ...presetRange(preset as AnalyticsPreset, today) };
  else if (preset === "custom") {
    try {
      const from = parseReportingDate(parameters.get("from")), to = parseReportingDate(parameters.get("to"));
      if (from <= to) selection = { preset: "custom", from, to };
    } catch { /* Fall back to the default period. */ }
  }
  const compareValue = parameters.get("compare");
  const compare = (comparisonModes as readonly string[]).includes(compareValue ?? "") ? compareValue as ComparisonMode : "previous";
  const filters: Filters = {};
  for (const key of analyticsFilterKeys) {
    const value = parameters.get(`f.${key}`);
    if (value) filters[key] = { value, label: parameters.get(`l.${key}`) ?? value };
  }
  return { selection, compare, filters };
}

function writeUrlState(selection: Selection, compare: ComparisonMode, filters: Filters) {
  const parameters = new URLSearchParams({ period: selection.preset });
  if (selection.preset === "custom") { parameters.set("from", selection.from); parameters.set("to", selection.to); }
  if (compare !== "previous") parameters.set("compare", compare);
  for (const [key, filter] of Object.entries(filters)) {
    if (!filter) continue;
    parameters.set(`f.${key}`, filter.value);
    if (filter.label !== filter.value) parameters.set(`l.${key}`, filter.label);
  }
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${parameters}`);
}

function deltaFor(card: (typeof cards)[number], current: number, previous: number | undefined, label: string) {
  if (previous === undefined) return null;
  if (card.rate) {
    const points = (current - previous) * 100;
    if (Math.abs(points) < 0.05) return { text: `No change vs ${label}`, tone: "neutral" as const };
    const better = card.lowerIsBetter ? points < 0 : points > 0;
    return { text: `${points > 0 ? "▲" : "▼"} ${Math.abs(points).toFixed(1)} pts vs ${label}`, tone: better ? "good" as const : "bad" as const };
  }
  if (previous === 0) return current === 0 ? { text: `No change vs ${label}`, tone: "neutral" as const } : { text: `▲ New vs ${label}`, tone: "good" as const };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { text: `No change vs ${label}`, tone: "neutral" as const };
  const better = card.lowerIsBetter ? change < 0 : change > 0;
  return { text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}% vs ${label}`, tone: better ? "good" as const : "bad" as const };
}

function filterOptions(report: AnalyticsReport | null, key: AnalyticsFilterKey): { value: string; label: string }[] {
  if (key === "visitor") return [{ value: "new", label: "New visitors" }, { value: "returning", label: "Returning visitors" }];
  if (!report) return [];
  const source: Record<Exclude<AnalyticsFilterKey, "visitor">, [BreakdownKey, string, string]> = {
    device: ["devices", "value", "label"], browser: ["browsers", "value", "label"], os: ["os", "value", "label"], country: ["countries", "value", "label"],
    city: ["cities", "value", "label"], channel: ["channels", "value", "label"], referrer: ["referrers", "value", "label"],
    campaign: ["campaigns", "campaign", "campaign"], page: ["pages", "path", "path"], entry: ["entries", "path", "path"],
  };
  const [dataset, valueKey, labelKey] = source[key];
  const seen = new Set<string>();
  return report.breakdowns[dataset].flatMap((row) => {
    const value = row[valueKey];
    if (value === null || value === undefined || seen.has(String(value))) return [];
    seen.add(String(value));
    return [{ value: String(value), label: String(row[labelKey] ?? value) }];
  });
}

export function AnalyticsDashboard({ username, today, developmentCredentials }: { username: string; today: ReportingDate; developmentCredentials: boolean }) {
  const [selection, setSelection] = useState<Selection>({ preset: "last-30", ...presetRange("last-30", today) });
  const [compare, setCompare] = useState<ComparisonMode>("previous");
  const [filters, setFilters] = useState<Filters>({});
  const [hydrated, setHydrated] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading", report: null, refreshing: false });
  const [attempt, setAttempt] = useState(0);
  const [metric, setMetric] = useState<TrendMetric>("visitors");
  const [live, setLive] = useState<LiveReport | null>(null);

  useEffect(() => {
    const state = readUrlState(today);
    setSelection(state.selection); setCompare(state.compare); setFilters(state.filters); setHydrated(true);
  }, [today]);
  useEffect(() => { if (hydrated) writeUrlState(selection, compare, filters); }, [hydrated, selection, compare, filters]);

  const query: ReportQuery = useMemo(() => ({ from: selection.from, to: selection.to, compare,
    filters: Object.fromEntries(Object.entries(filters).map(([key, filter]) => [key, filter!.value])) }), [selection, compare, filters]);
  const parameters = useMemo(() => reportParameters(query).toString(), [query]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setLoad((current) => ({ ...current, status: current.report ? "ready" : "loading", refreshing: current.report !== null }));
    (async () => {
      try {
        const response = await fetch(`/api/analytics/report?${parameters}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { window.location.reload(); return; }
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "Analytics data is unavailable.");
        setLoad({ status: "ready", report: body as AnalyticsReport, refreshing: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoad((current) => ({ status: "error", report: current.report, refreshing: false,
          message: error instanceof Error ? error.message : "Analytics data is unavailable." }));
      }
    })();
    return () => controller.abort();
  }, [hydrated, parameters, attempt]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/analytics/live", { cache: "no-store" });
          if (response.ok) setLive(await response.json() as LiveReport);
        } catch { /* Keep the last live count. */ }
      }
      if (!stopped) timer = setTimeout(poll, 15_000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  const addFilter = useCallback((key: AnalyticsFilterKey, value: string, label: string) => {
    setFilters((current) => ({ ...current, [key]: { value, label } }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const removeFilter = (key: AnalyticsFilterKey) => setFilters((current) => { const next = { ...current }; delete next[key]; return next; });

  const report = load.report;
  const busy = load.refreshing;
  const compareLabel = compare === "year" ? "last year" : "previous period";
  const exportHref = (dataset: string) => `/api/analytics/export?dataset=${dataset}&${parameters}`;
  const empty = report !== null && report.summary.visits === 0 && report.summary.pageviews === 0;

  return (
    <Shell>
      <TopBar>
        <TopBarContent>
          <Brand href="/en"><BrandImage src="/brand/goal-hint-logo-inverse.svg" alt="Goal Hint" width={112} height={26} /><span>Analytics</span></Brand>
          <TopActions>
            <LivePill aria-live="polite" title="Distinct visitors active in the last five minutes">{live ? count(live.visitors) : "–"} live</LivePill>
            <span>Signed in as <strong>{username}</strong></span>
            <form method="post" action="/api/analytics/logout"><HeaderButton type="submit">Sign out</HeaderButton></form>
          </TopActions>
        </TopBarContent>
      </TopBar>
      <Main id="main-content">
        <PageTitle>
          <h1>Visitor analytics</h1>
          <p>{formatRange(selection)} · East Africa Time{report ? ` · updated ${new Date(report.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        </PageTitle>
        {developmentCredentials && <Notice $tone="warning">
          Development sign-in is active. Production refuses it: set GOAL_HINT_ANALYTICS_ADMIN_USERNAME, GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH and GOAL_HINT_ANALYTICS_SECRET before deploying.
        </Notice>}
        <FilterControls selection={selection} compare={compare} filters={filters} today={today} report={report}
          onSelection={setSelection} onCompare={setCompare} onAddFilter={addFilter} onRemoveFilter={removeFilter}
          exportHref={exportHref("summary")} />
        {load.status === "error" && <Notice $tone="error" role="alert">
          {load.message ?? "Analytics data is unavailable."}
          <ToolButton type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</ToolButton>
        </Notice>}
        {load.status === "loading" && !report ? <LoadingState /> : report && <>
          <Cards as="dl" $busy={busy} aria-busy={busy} aria-label="Summary">
            {cards.map((card) => {
              const delta = deltaFor(card, report.summary[card.key], report.previous?.[card.key], compareLabel);
              return <Card key={card.key}>
                <dt>{card.label}</dt>
                <CardValue>{card.format(report.summary[card.key])}</CardValue>
                {delta && <Delta $tone={delta.tone}>{delta.text}</Delta>}
              </Card>;
            })}
            <Card><dt>Live now</dt><CardValue>{live ? count(live.visitors) : "–"}</CardValue><Delta $tone="neutral">Active in the last 5 minutes</Delta></Card>
          </Cards>
          {empty ? <Panel>
            <EmptyChart>
              No visits recorded for {formatRange(selection)}{Object.keys(filters).length ? " with these filters" : ""}. Visitors appear here once they
              allow analytics in the consent banner; your own browser is excluded after you sign in.
            </EmptyChart>
          </Panel> : <>
            <TrendPanel report={report} metric={metric} onMetric={setMetric} busy={busy} compareLabel={compareLabel} exportHref={exportHref("timeseries")} />
            <Grid $columns={3}>
              <Panel $busy={busy}>
                <PanelHeader><h2>New vs returning</h2></PanelHeader>
                <SplitBar label="Visitors by type" parts={[
                  { label: "New visitors", value: report.summary.newVisitors, display: count(report.summary.newVisitors) },
                  { label: "Returning visitors", value: report.summary.returningVisitors, display: count(report.summary.returningVisitors) },
                ]} />
                <Muted>{count(report.summary.visits)} visits from {count(report.summary.visitors)} visitors · {(report.summary.visitors ? report.summary.visits / report.summary.visitors : 0).toFixed(2)} visits per visitor</Muted>
              </Panel>
              <Panel $busy={busy}>
                <PanelHeader><h2>Devices</h2></PanelHeader>
                <BarList format={count} empty="No device data." onSelect={(key) => addFilter("device", key, String(report.breakdowns.devices.find((row) => row.value === key)?.label ?? key))}
                  rows={report.breakdowns.devices.map((row) => ({ key: String(row.value), label: String(row.label), value: Number(row.visits) }))} />
              </Panel>
              <Panel $busy={busy}>
                <PanelHeader><h2>Channels</h2></PanelHeader>
                <BarList format={count} empty="No source data." onSelect={(key) => addFilter("channel", key, String(report.breakdowns.channels.find((row) => row.value === key)?.label ?? key))}
                  rows={report.breakdowns.channels.slice(0, 6).map((row) => ({ key: String(row.value), label: String(row.label), value: Number(row.visits) }))} />
              </Panel>
            </Grid>
            <Grid $columns={3}>
              <Panel $busy={busy}>
                <PanelHeader><h2>Visit frequency</h2><p>Visitors by visits in this period</p></PanelHeader>
                <ColumnChart label="Visitors by number of visits" format={count}
                  columns={report.breakdowns.frequency.map((row) => ({ label: String(row.label).replace(" visits", "").replace(" visit", ""), value: Number(row.visitors) }))} />
              </Panel>
              <WidePanel $busy={busy}>
                <PanelHeader><h2>When visits start</h2><p>Weekday and hour, East Africa Time</p></PanelHeader>
                <Heatmap grid={report.heatmap} format={count} />
              </WidePanel>
            </Grid>
            <Grid $columns={2}>
              <Panel $busy={busy}>
                <PanelHeader><h2>Top countries</h2></PanelHeader>
                <BarList format={count} empty="No location data." onSelect={(key) => addFilter("country", key, String(report.breakdowns.countries.find((row) => row.value === key)?.label ?? key))}
                  rows={report.breakdowns.countries.slice(0, 6).map((row) => ({ key: String(row.value), label: String(row.label), value: Number(row.visits) }))} />
              </Panel>
              <Panel>
                <PanelHeader><h2>Active now</h2><p>Pages with visitors in the last five minutes</p></PanelHeader>
                {live && live.pages.length > 0 ? <LiveList>{live.pages.map((page) => <li key={page.path}>
                  <span title={page.path}>{page.title ?? page.path}</span><strong>{count(page.visitors)}</strong></li>)}</LiveList>
                  : <EmptyChart>Nobody is active right now.</EmptyChart>}
              </Panel>
            </Grid>
            {sections.map((section) => <BreakdownSection key={section.id} section={section} report={report} busy={busy}
              exportHref={exportHref} onFilter={addFilter} />)}
          </>}
        </>}
        <SettingsPanel />
        <Panel as="details">
          <summary><strong>Metric definitions</strong></summary>
          <Definitions>{definitions.map(([term, description]) => <div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}</Definitions>
        </Panel>
      </Main>
    </Shell>
  );
}

function FilterControls({ selection, compare, filters, today, report, onSelection, onCompare, onAddFilter, onRemoveFilter, exportHref }: {
  selection: Selection; compare: ComparisonMode; filters: Filters; today: ReportingDate; report: AnalyticsReport | null;
  onSelection: (value: Selection) => void; onCompare: (value: ComparisonMode) => void;
  onAddFilter: (key: AnalyticsFilterKey, value: string, label: string) => void; onRemoveFilter: (key: AnalyticsFilterKey) => void; exportHref: string;
}) {
  const [dimension, setDimension] = useState<AnalyticsFilterKey | "">("");
  const fromInput = useRef<HTMLInputElement>(null), toInput = useRef<HTMLInputElement>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const options = dimension ? filterOptions(report, dimension) : [];

  function applyCustom() {
    try {
      const from = parseReportingDate(fromInput.current?.value), to = parseReportingDate(toInput.current?.value);
      if (from > to) { setCustomError("The start date must be on or before the end date."); return; }
      if (rangeDays({ from, to }) > analyticsRules.maximumRangeDays) { setCustomError("Choose at most three years."); return; }
      setCustomError(null);
      onSelection({ preset: "custom", from, to });
    } catch { setCustomError("Enter both dates."); }
  }

  return (
    <FilterBar aria-label="Report filters">
      <Field>Period
        <select value={selection.preset} onChange={(event) => {
          const preset = event.target.value as AnalyticsPreset | "custom";
          onSelection(preset === "custom" ? { ...selection, preset } : { preset, ...presetRange(preset, today) });
        }}>
          {Object.entries(analyticsPresets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="custom">Custom range…</option>
        </select>
      </Field>
      {selection.preset === "custom" && <>
        <Field>From<input ref={fromInput} type="date" defaultValue={selection.from} max={today} onChange={applyCustom} /></Field>
        <Field>To<input ref={toInput} type="date" defaultValue={selection.to} max={today} onChange={applyCustom} /></Field>
      </>}
      <Field>Compare with
        <select value={compare} onChange={(event) => onCompare(event.target.value as ComparisonMode)}>
          <option value="previous">Previous period</option>
          <option value="year">Same period last year</option>
          <option value="none">No comparison</option>
        </select>
      </Field>
      <Field>Add a segment
        <select value={dimension} onChange={(event) => setDimension(event.target.value as AnalyticsFilterKey | "")}>
          <option value="">Choose a dimension…</option>
          {analyticsFilterKeys.filter((key) => !filters[key]).map((key) => <option key={key} value={key}>{analyticsFilterLabels[key]}</option>)}
        </select>
      </Field>
      {dimension && <Field>{analyticsFilterLabels[dimension]}
        <select value="" onChange={(event) => {
          const option = options.find((entry) => entry.value === event.target.value);
          if (option) { onAddFilter(dimension, option.value, option.label); setDimension(""); }
        }}>
          <option value="">{options.length ? "Choose a value…" : "No values in this period"}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>}
      <ToolButton as="a" href={exportHref} download $variant="secondary" style={{ marginInlineStart: "auto" }}>Export summary CSV</ToolButton>
      {customError && <Notice $tone="error" role="alert" style={{ inlineSize: "100%" }}>{customError}</Notice>}
      <Chips aria-label="Active segments">
        {(Object.entries(filters) as [AnalyticsFilterKey, Filters[AnalyticsFilterKey]][]).map(([key, filter]) => filter && <Chip key={key}>
          <span>{analyticsFilterLabels[key]}: <strong>{filter.label}</strong></span>
          <button type="button" aria-label={`Remove ${analyticsFilterLabels[key]} filter`} onClick={() => onRemoveFilter(key)}>×</button>
        </Chip>)}
      </Chips>
    </FilterBar>
  );
}

function TrendPanel({ report, metric, onMetric, busy, compareLabel, exportHref }: {
  report: AnalyticsReport; metric: TrendMetric; onMetric: (value: TrendMetric) => void; busy: boolean; compareLabel: string; exportHref: string;
}) {
  const [table, setTable] = useState(false);
  const definition = trendMetrics[metric];
  const granularity = report.range.granularity;
  const points = report.series.map((point, index) => {
    const previous = report.previousSeries?.[index];
    return { label: bucketLabel(point.key, granularity), value: point[metric],
      previous: previous ? previous[metric] : undefined, previousLabel: previous ? bucketLabel(previous.key, granularity) : undefined };
  });
  return (
    <Panel $busy={busy} aria-busy={busy}>
      <PanelHeader>
        <h2>Traffic over time</h2>
        <Segmented role="group" aria-label="Chart metric">
          {(Object.keys(trendMetrics) as TrendMetric[]).map((key) => <SegmentButton key={key} type="button" $selected={metric === key}
            aria-pressed={metric === key} onClick={() => onMetric(key)}>{trendMetrics[key].label}</SegmentButton>)}
        </Segmented>
      </PanelHeader>
      <TrendChart points={points} format={definition.format} axisFormat={definition.axis} integer={definition.integer} name={`${definition.label}, ${formatRange(report.range)}`}
        comparisonName={report.comparison ? `${definition.label}, ${compareLabel}` : undefined} />
      <SettingsRow>
        <ToolButton type="button" $variant="quiet" aria-expanded={table} onClick={() => setTable((value) => !value)}>{table ? "Hide table" : "Show as table"}</ToolButton>
        <ToolButton as="a" href={exportHref} download $variant="quiet">Export CSV</ToolButton>
        <Muted>{granularity === "hour" ? "Hourly" : granularity === "week" ? "Weekly (weeks start Monday)" : "Daily"} buckets</Muted>
      </SettingsRow>
      {table && <div style={{ overflowX: "auto" }}><SeriesTable>
        <thead><tr><th scope="col">Period</th>{(Object.keys(trendMetrics) as TrendMetric[]).map((key) => <th key={key} scope="col">{trendMetrics[key].label}</th>)}</tr></thead>
        <tbody>{report.series.map((point) => <tr key={point.key}><td>{bucketLabel(point.key, granularity)}</td>
          {(Object.keys(trendMetrics) as TrendMetric[]).map((key) => <td key={key}>{trendMetrics[key].format(point[key])}</td>)}</tr>)}</tbody>
      </SeriesTable></div>}
    </Panel>
  );
}

function BreakdownSection({ section, report, busy, exportHref, onFilter }: {
  section: (typeof sections)[number]; report: AnalyticsReport; busy: boolean; exportHref: (dataset: string) => string;
  onFilter: (key: AnalyticsFilterKey, value: string, label: string) => void;
}) {
  const [selected, setSelected] = useState<BreakdownKey>(section.tabs[0]!);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dataset = analyticsDatasets[selected];
  const filter = dataset.filter;
  const valueKey = dataset.filterValue;
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = section.tabs.indexOf(selected);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = section.tabs[(next + section.tabs.length) % section.tabs.length]!;
    setSelected(target);
    tabs.current[section.tabs.indexOf(target)]?.focus();
  }
  return (
    <Panel $busy={busy} aria-labelledby={`${section.id}-title`}>
      <PanelHeader><h2 id={`${section.id}-title`}>{section.title}</h2></PanelHeader>
      <Tabs role="tablist" aria-labelledby={`${section.id}-title`} onKeyDown={onKey}>
        {section.tabs.map((key, index) => <Tab key={key} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab"
          id={`${section.id}-tab-${key}`} aria-controls={`${section.id}-panel`} aria-selected={selected === key} tabIndex={selected === key ? 0 : -1}
          $selected={selected === key} onClick={() => setSelected(key)}>
          {analyticsDatasets[key].title} <Count>{report.breakdowns[key].length >= analyticsRules.topRows ? `${analyticsRules.topRows}+` : report.breakdowns[key].length}</Count>
        </Tab>)}
      </Tabs>
      <div role="tabpanel" id={`${section.id}-panel`} aria-labelledby={`${section.id}-tab-${selected}`}>
        <DataTable key={selected} id={`${section.id}-${selected}`} dataset={dataset} rows={report.breakdowns[selected]} exportHref={exportHref(selected)}
          onFilter={filter && valueKey ? (row: BreakdownRow) => {
            const value = row[valueKey];
            if (value !== null && value !== undefined) onFilter(filter, String(value), String(row.label ?? row.path ?? row.campaign ?? value));
          } : undefined} />
      </div>
    </Panel>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <span style={{ marginInlineStart: 4, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{children}</span>;
}

function LoadingState() {
  return <div aria-busy="true" aria-label="Loading analytics" style={{ display: "grid", gap: 16 }}>
    <Skeleton $height={92} /><Skeleton $height={300} />
    <Grid $columns={3}><Skeleton $height={180} /><Skeleton $height={180} /><Skeleton $height={180} /></Grid>
  </div>;
}

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/analytics/settings", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as Settings;
      setSettings(body); setDays(body.retention.retentionDays);
    }).catch(() => setStatus({ tone: "error", text: "Settings are unavailable." }));
  }, []);

  async function post(body: object) {
    setSaving(true); setStatus(null);
    try {
      const response = await fetch("/api/analytics/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message ?? "The change was not saved.");
      setSettings(result); setDays(result.retention.retentionDays);
      const purged = result.purged;
      setStatus({ tone: "info", text: `Saved. Removed ${count((purged?.sessions ?? 0) + (purged?.pageviews ?? 0) + (purged?.events ?? 0))} expired records.` });
    } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : "The change was not saved." }); }
    finally { setSaving(false); }
  }

  const choices = settings ? [...new Set([...settings.retentionChoices, settings.retention.retentionDays])].sort((a, b) => a - b) : [];
  return (
    <Panel aria-labelledby="settings-title">
      <PanelHeader><h2 id="settings-title">Data retention and tracking</h2></PanelHeader>
      {settings ? <>
        <Muted>
          Tracking is {settings.collecting ? "on" : "off"} · location from {settings.geoSource === "timezone" ? "browser time zones" : `${settings.geoSource} edge headers`} ·
          this browser is {settings.browserExcluded ? "excluded from statistics" : "not yet excluded"} · last automatic purge {settings.retention.lastPurgedAt
            ? new Date(settings.retention.lastPurgedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "not yet run"}
        </Muted>
        <SettingsRow>
          <Field style={{ maxInlineSize: "16rem" }}>Keep raw analytics for
            <select value={days ?? ""} onChange={(event) => setDays(Number(event.target.value))}>
              {choices.map((value) => <option key={value} value={value}>{value} days{value === 395 ? " (13 months, default)" : ""}</option>)}
            </select>
          </Field>
          <ToolButton type="button" $variant="primary" disabled={saving || days === null || days === settings.retention.retentionDays} onClick={() => {
            if (days !== null && days < settings.retention.retentionDays
              && !window.confirm(`Shorten retention to ${days} days? Records older than that are deleted now and cannot be recovered.`)) return;
            void post({ action: "retention", days });
          }}>Save retention</ToolButton>
          <ToolButton type="button" disabled={saving} onClick={() => void post({ action: "purge" })}>Purge expired data now</ToolButton>
        </SettingsRow>
        <Muted>Records older than the retention period are deleted automatically every hour. Source: {settings.retention.source === "dashboard"
          ? "set in this dashboard" : "GOAL_HINT_ANALYTICS_RETENTION_DAYS or the 395-day default"}.</Muted>
      </> : !status && <Skeleton $height={60} />}
      {status && <Notice $tone={status.tone} role="status">{status.text}</Notice>}
    </Panel>
  );
}
