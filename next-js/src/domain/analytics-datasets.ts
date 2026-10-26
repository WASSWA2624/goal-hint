import type { AnalyticsFilterKey, BreakdownKey, BreakdownRow } from "./analytics.ts";

export type ColumnKind = "text" | "count" | "percent" | "duration" | "decimal";
export type DatasetColumn = Readonly<{ key: string; header: string; kind: ColumnKind }>;
export type Dataset = Readonly<{
  title: string;
  description: string;
  columns: readonly DatasetColumn[];
  /** Clicking a row adds this segment filter, using the row's `filterValue` column. */
  filter?: AnalyticsFilterKey;
  filterValue?: string;
}>;

const visitMetrics: readonly DatasetColumn[] = [
  { key: "visits", header: "Visits", kind: "count" },
  { key: "visitors", header: "Visitors", kind: "count" },
  { key: "pageviews", header: "Page views", kind: "count" },
  { key: "bounceRate", header: "Bounce rate", kind: "percent" },
  { key: "avgVisitMs", header: "Avg. visit", kind: "duration" },
  { key: "conversions", header: "Converted visits", kind: "count" },
];
const dimension = (title: string, description: string, header: string, filter?: AnalyticsFilterKey): Dataset =>
  ({ title, description, columns: [{ key: "label", header, kind: "text" }, ...visitMetrics], ...(filter ? { filter, filterValue: "value" } : {}) });

export const analyticsDatasets: Readonly<Record<BreakdownKey, Dataset>> = Object.freeze({
  pages: { title: "Pages", description: "Every page address viewed in the period.", filter: "page", filterValue: "path", columns: [
    { key: "path", header: "Page", kind: "text" }, { key: "title", header: "Title", kind: "text" },
    { key: "views", header: "Views", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" },
    { key: "avgMs", header: "Avg. time on page", kind: "duration" }, { key: "entries", header: "Entrances", kind: "count" },
    { key: "exits", header: "Exits", kind: "count" }, { key: "exitRate", header: "Exit rate", kind: "percent" }] },
  routes: { title: "Content groups", description: "Pages grouped by template, such as every match analysis.", columns: [
    { key: "label", header: "Content group", kind: "text" }, { key: "route", header: "Template", kind: "text" },
    { key: "views", header: "Views", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" },
    { key: "avgMs", header: "Avg. time on page", kind: "duration" }] },
  entries: { title: "Entry pages", description: "The first page of each visit.", filter: "entry", filterValue: "path", columns: [
    { key: "path", header: "Entry page", kind: "text" }, { key: "visits", header: "Visits", kind: "count" },
    { key: "bounceRate", header: "Bounce rate", kind: "percent" }, { key: "avgVisitMs", header: "Avg. visit", kind: "duration" },
    { key: "conversions", header: "Converted visits", kind: "count" }] },
  exits: { title: "Exit pages", description: "The last page of each visit.", filter: "page", filterValue: "path", columns: [
    { key: "path", header: "Exit page", kind: "text" }, { key: "exits", header: "Exits", kind: "count" },
    { key: "share", header: "Share of visits", kind: "percent" }] },
  transitions: { title: "Page-to-page", description: "Where visitors went next, from one page to the following page.", columns: [
    { key: "from", header: "From", kind: "text" }, { key: "to", header: "To", kind: "text" }, { key: "count", header: "Transitions", kind: "count" }] },
  journeys: { title: "Journeys", description: "The first four content groups of each visit, in order.", columns: [
    { key: "journey", header: "Journey", kind: "text" }, { key: "visits", header: "Visits", kind: "count" }, { key: "share", header: "Share", kind: "percent" }] },
  channels: dimension("Channels", "How visitors arrived: search, social, campaigns, referrals or directly.", "Channel", "channel"),
  referrers: dimension("Referrers", "External websites and apps that sent visitors.", "Referrer", "referrer"),
  campaigns: { title: "Campaigns", description: "UTM-tagged links. Click identifiers are reduced to their ad network.", filter: "campaign", filterValue: "campaign", columns: [
    { key: "source", header: "Source", kind: "text" }, { key: "medium", header: "Medium", kind: "text" }, { key: "campaign", header: "Campaign", kind: "text" },
    ...visitMetrics] },
  countries: dimension("Countries", "Approximate country from the browser time zone or a trusted edge header.", "Country", "country"),
  cities: dimension("Cities", "Approximate city: the time zone's reference city unless an edge header is configured.", "City", "city"),
  browsers: dimension("Browsers", "Browser family; versions are kept to the major number.", "Browser", "browser"),
  os: dimension("Operating systems", "Operating system family.", "Operating system", "os"),
  devices: dimension("Devices", "Desktop, mobile or tablet.", "Device", "device"),
  languages: dimension("Languages", "Preferred browser language.", "Language"),
  screens: dimension("Screen widths", "Viewport width bands in CSS pixels.", "Width"),
  clicks: { title: "Clicks", description: "Links and buttons clicked, by visible label. Typed text is never recorded.", columns: [
    { key: "label", header: "Element", kind: "text" }, { key: "target", header: "Destination", kind: "text" },
    { key: "count", header: "Clicks", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" }] },
  outbound: { title: "Outbound links", description: "Links to other websites, without query strings.", columns: [
    { key: "host", header: "Website", kind: "text" }, { key: "target", header: "Address", kind: "text" },
    { key: "count", header: "Clicks", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" }] },
  searches: { title: "Searches", description: "Match searches, lower-cased; email addresses and long numbers are redacted.", columns: [
    { key: "term", header: "Search term", kind: "text" }, { key: "count", header: "Searches", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" }] },
  downloads: { title: "Downloads", description: "Files opened through download links.", columns: [
    { key: "file", header: "File", kind: "text" }, { key: "target", header: "Address", kind: "text" },
    { key: "count", header: "Downloads", kind: "count" }, { key: "visitors", header: "Visitors", kind: "count" }] },
  conversions: { title: "Conversions", description: "Goals reached, counted once per visit.", columns: [
    { key: "label", header: "Goal", kind: "text" }, { key: "count", header: "Conversions", kind: "count" },
    { key: "rate", header: "Conversion rate", kind: "percent" }] },
  frequency: { title: "Visits per visitor", description: "How many separate visits each visitor made in this period.", columns: [
    { key: "label", header: "Visits in period", kind: "text" }, { key: "visitors", header: "Visitors", kind: "count" }, { key: "share", header: "Share", kind: "percent" }] },
  loyalty: { title: "Visit number", description: "Which lifetime visit each visit was for that browser: first, second, and so on.", columns: [
    { key: "label", header: "Visit number", kind: "text" }, { key: "visits", header: "Visits", kind: "count" }, { key: "share", header: "Share", kind: "percent" }] },
});

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export const formatPercent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatValue(value: BreakdownRow[string] | undefined, kind: ColumnKind, { compactNumbers = false } = {}): string {
  if (value === null || value === undefined || value === "") return kind === "text" ? "—" : "0";
  if (kind === "text") return String(value);
  const number = Number(value);
  switch (kind) {
    case "count": return compactNumbers && number >= 10_000 ? compact.format(number) : integer.format(number);
    case "decimal": return decimal.format(number);
    case "percent": return formatPercent(number);
    case "duration": return formatDuration(number);
  }
}

/** CSV keeps raw numbers: percentages as 0-100 with two decimals and durations in seconds. */
export function csvValue(value: BreakdownRow[string] | undefined, kind: ColumnKind): string | number | null {
  if (value === null || value === undefined) return null;
  if (kind === "text") return String(value);
  const number = Number(value);
  if (kind === "percent") return Math.round(number * 10_000) / 100;
  if (kind === "duration") return Math.round(number / 100) / 10;
  return number;
}

export function csvHeader(column: DatasetColumn): string {
  return column.kind === "percent" ? `${column.header} (%)` : column.kind === "duration" ? `${column.header} (seconds)` : column.header;
}
