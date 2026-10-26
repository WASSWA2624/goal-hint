import "server-only";

import { Prisma } from "../generated/prisma/client.ts";
import { analyticsChannels, analyticsGoalLabel, analyticsRouteLabel, analyticsRules, type AnalyticsReport, type AnalyticsSummary,
  type BreakdownKey, type BreakdownRow, type LiveReport, type ReportQuery, type SeriesPoint } from "../../domain/analytics.ts";
import { bucketKeys, comparisonRange, granularityFor, parseDateRange, rangeDays, type DateRange, type Granularity } from "../../domain/analytics-range.ts";
import { getReportingDayBounds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";

type Row = Record<string, unknown>;

/** MySQL and MariaDB return counts as bigint and sums or averages as decimals; reports use plain numbers. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const number = typeof value === "number" ? value : Number(typeof value === "bigint" ? value : String(value));
  return Number.isFinite(number) ? number : 0;
}
const text = (value: unknown) => value === null || value === undefined ? null : String(value);
const ratio = (part: number, whole: number) => whole > 0 ? part / whole : 0;

type Window = Readonly<{ start: Date; end: Date; offsetMinutes: number }>;

export function reportWindow(range: DateRange): Window {
  const start = getReportingDayBounds(range.from).startInclusive;
  const end = getReportingDayBounds(range.to).endExclusive;
  // Kampala has no daylight saving, so one offset converts the whole period to local time.
  const offsetMinutes = Math.round((Date.parse(`${range.from}T00:00:00Z`) - start) / 60_000);
  return { start: new Date(start), end: new Date(end), offsetMinutes };
}

const deviceLabels: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
let countryNames: Intl.DisplayNames | undefined;
export function countryLabel(code: string | null): string {
  if (!code) return "Unknown";
  countryNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  try { return countryNames.of(code) ?? code; } catch { return code; }
}
let languageNames: Intl.DisplayNames | undefined;
function languageLabel(code: string | null): string {
  if (!code) return "Unknown";
  languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
  try { return languageNames.of(code) ?? code; } catch { return code; }
}

export function createAnalyticsReporter(database: DatabaseRuntime, { now = Date.now }: { now?: () => number } = {}) {
  const read = <T extends Row>(sql: Prisma.Sql) => database.query((client) => client.$queryRaw<T[]>(sql));

  /** Segment filters are equality tests on visit columns; values are always bound parameters. */
  function filterSql(filters: ReportQuery["filters"], alias = "s"): Prisma.Sql {
    const s = Prisma.raw(alias);
    const parts: Prisma.Sql[] = [];
    const nullable = (column: string, value: string, none: string) => value === none
      ? Prisma.sql`${s}.${Prisma.raw(column)} IS NULL` : Prisma.sql`${s}.${Prisma.raw(column)} = ${value}`;
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      switch (key) {
        case "device": parts.push(Prisma.sql`${s}.deviceType = ${value}`); break;
        case "browser": parts.push(Prisma.sql`${s}.browser = ${value}`); break;
        case "os": parts.push(Prisma.sql`${s}.os = ${value}`); break;
        case "country": parts.push(nullable("country", value, "(unknown)")); break;
        case "city": parts.push(nullable("city", value, "(unknown)")); break;
        case "channel": parts.push(Prisma.sql`${s}.channel = ${value}`); break;
        case "referrer": parts.push(nullable("referrerHost", value, "(none)")); break;
        case "campaign": parts.push(nullable("utmCampaign", value, "(none)")); break;
        case "visitor": parts.push(Prisma.sql`${s}.isNewVisitor = ${value === "new" ? 1 : 0}`); break;
        case "entry": parts.push(Prisma.sql`${s}.entryPath = ${value}`); break;
        case "page": parts.push(Prisma.sql`EXISTS (SELECT 1 FROM AnalyticsPageview fp WHERE fp.sessionId = ${s}.id AND fp.path = ${value})`); break;
      }
    }
    return parts.length === 0 ? Prisma.sql`1 = 1` : Prisma.join(parts, " AND ");
  }

  const sessionsIn = (w: Window, filters: ReportQuery["filters"]) =>
    Prisma.sql`s.startedAt >= ${w.start} AND s.startedAt < ${w.end} AND ${filterSql(filters)}`;
  const local = (column: string, w: Window) => Prisma.sql`DATE_ADD(${Prisma.raw(column)}, INTERVAL ${w.offsetMinutes} MINUTE)`;
  function bucket(column: string, w: Window, granularity: Granularity): Prisma.Sql {
    const value = local(column, w);
    if (granularity === "hour") return Prisma.sql`DATE_FORMAT(${value}, '%Y-%m-%d %H')`;
    if (granularity === "day") return Prisma.sql`DATE_FORMAT(${value}, '%Y-%m-%d')`;
    return Prisma.sql`DATE_FORMAT(DATE_SUB(DATE(${value}), INTERVAL WEEKDAY(${value}) DAY), '%Y-%m-%d')`;
  }
  const duration = Prisma.sql`GREATEST(TIMESTAMPDIFF(MICROSECOND, s.startedAt, s.lastSeenAt) / 1000, s.engagedMs)`;
  const bounce = Prisma.sql`(s.pageviews < 2 AND s.engagedMs < ${analyticsRules.engagedVisitMs} AND s.converted = 0)`;
  const visitColumns = Prisma.sql`COUNT(*) AS visits, COUNT(DISTINCT s.visitorId) AS visitors, SUM(s.pageviews) AS pageviews,
    SUM(CASE WHEN ${bounce} THEN 1 ELSE 0 END) AS bounces, AVG(${duration}) AS avgVisitMs, SUM(s.converted) AS conversions`;
  const visitMetrics = (row: Row) => ({ visits: num(row.visits), visitors: num(row.visitors), pageviews: num(row.pageviews),
    bounceRate: ratio(num(row.bounces), num(row.visits)), avgVisitMs: Math.round(num(row.avgVisitMs)), conversions: num(row.conversions) });

  async function summary(w: Window, filters: ReportQuery["filters"]): Promise<AnalyticsSummary> {
    const where = sessionsIn(w, filters);
    const [[visits], [pages], [conversions]] = await Promise.all([
      read(Prisma.sql`SELECT ${visitColumns}, SUM(s.isNewVisitor) AS newVisitors,
        COUNT(DISTINCT CASE WHEN s.isNewVisitor = 0 THEN s.visitorId END) AS returningVisitors FROM AnalyticsSession s WHERE ${where}`),
      read(Prisma.sql`SELECT COUNT(*) AS views, AVG(p.engagedMs) AS avgPageMs FROM AnalyticsPageview p JOIN AnalyticsSession s ON s.id = p.sessionId
        WHERE p.occurredAt >= ${w.start} AND p.occurredAt < ${w.end} AND ${filterSql(filters)}`),
      read(Prisma.sql`SELECT COUNT(*) AS count FROM AnalyticsEvent e JOIN AnalyticsSession s ON s.id = e.sessionId
        WHERE e.type = 'conversion' AND e.occurredAt >= ${w.start} AND e.occurredAt < ${w.end} AND ${filterSql(filters)}`),
    ]);
    const metrics = visitMetrics(visits ?? {});
    return {
      visitors: metrics.visitors, visits: metrics.visits, pageviews: num(pages?.views),
      pagesPerVisit: ratio(metrics.pageviews, metrics.visits), avgVisitMs: metrics.avgVisitMs, bounceRate: metrics.bounceRate,
      avgPageMs: Math.round(num(pages?.avgPageMs)), conversions: num(conversions?.count), conversionRate: ratio(metrics.conversions, metrics.visits),
      newVisitors: num(visits?.newVisitors), returningVisitors: num(visits?.returningVisitors),
    };
  }

  async function series(range: DateRange, w: Window, granularity: Granularity, filters: ReportQuery["filters"]): Promise<SeriesPoint[]> {
    const sessionKey = bucket("s.startedAt", w, granularity);
    const [visits, pages, conversions] = await Promise.all([
      read(Prisma.sql`SELECT ${sessionKey} AS bucket, ${visitColumns} FROM AnalyticsSession s WHERE ${sessionsIn(w, filters)} GROUP BY bucket`),
      read(Prisma.sql`SELECT ${bucket("p.occurredAt", w, granularity)} AS bucket, COUNT(*) AS views FROM AnalyticsPageview p
        JOIN AnalyticsSession s ON s.id = p.sessionId WHERE p.occurredAt >= ${w.start} AND p.occurredAt < ${w.end} AND ${filterSql(filters)} GROUP BY bucket`),
      read(Prisma.sql`SELECT ${bucket("e.occurredAt", w, granularity)} AS bucket, COUNT(*) AS count FROM AnalyticsEvent e
        JOIN AnalyticsSession s ON s.id = e.sessionId WHERE e.type = 'conversion' AND e.occurredAt >= ${w.start} AND e.occurredAt < ${w.end}
        AND ${filterSql(filters)} GROUP BY bucket`),
    ]);
    const byKey = <T>(rows: Row[], value: (row: Row) => T) => new Map(rows.map((row) => [String(row.bucket), value(row)]));
    const visitMap = byKey(visits, visitMetrics), pageMap = byKey(pages, (row) => num(row.views)), conversionMap = byKey(conversions, (row) => num(row.count));
    return bucketKeys(range, granularity).map((key) => {
      const visit = visitMap.get(key);
      return { key, visitors: visit?.visitors ?? 0, visits: visit?.visits ?? 0, pageviews: pageMap.get(key) ?? 0,
        bounceRate: visit?.bounceRate ?? 0, avgVisitMs: visit?.avgVisitMs ?? 0, conversions: conversionMap.get(key) ?? 0 };
    });
  }

  async function heatmap(w: Window, filters: ReportQuery["filters"]): Promise<number[][]> {
    const time = local("s.startedAt", w);
    const rows = await read(Prisma.sql`SELECT WEEKDAY(${time}) AS weekday, HOUR(${time}) AS hour, COUNT(*) AS visits
      FROM AnalyticsSession s WHERE ${sessionsIn(w, filters)} GROUP BY weekday, hour`);
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const row of rows) {
      const line = grid[num(row.weekday)];
      if (line && num(row.hour) < 24) line[num(row.hour)] = num(row.visits);
    }
    return grid;
  }

  async function breakdowns(w: Window, filters: ReportQuery["filters"], totals: AnalyticsSummary): Promise<Record<BreakdownKey, BreakdownRow[]>> {
    const where = sessionsIn(w, filters);
    const pageWhere = Prisma.sql`p.occurredAt >= ${w.start} AND p.occurredAt < ${w.end} AND ${filterSql(filters)}`;
    const eventWhere = (type: string) => Prisma.sql`e.type = ${type} AND e.occurredAt >= ${w.start} AND e.occurredAt < ${w.end} AND ${filterSql(filters)}`;
    const limit = Prisma.sql`LIMIT ${analyticsRules.topRows}`;
    const byDimension = (column: string, extra = Prisma.empty) => read(Prisma.sql`SELECT ${Prisma.raw(column)} AS value, ${visitColumns}
      FROM AnalyticsSession s WHERE ${where} ${extra} GROUP BY ${Prisma.raw(column)} ORDER BY visits DESC ${limit}`);
    const eventRows = (type: string, target = true) => read(Prisma.sql`SELECT e.name AS name, ${target ? Prisma.sql`e.target` : Prisma.sql`NULL`} AS target,
      COUNT(*) AS count, COUNT(DISTINCT e.visitorId) AS visitors FROM AnalyticsEvent e JOIN AnalyticsSession s ON s.id = e.sessionId
      WHERE ${eventWhere(type)} GROUP BY e.name${target ? Prisma.sql`, e.target` : Prisma.empty} ORDER BY count DESC ${limit}`);
    const [pages, routes, entries, exits, transitions, journeys, channels, referrers, campaigns, countries, cities, browsers, systems,
      devices, languages, screens, clicks, outbound, searches, downloads, conversions, frequency, loyalty] = await Promise.all([
      read(Prisma.sql`SELECT p.path AS path, MAX(p.title) AS title, COUNT(*) AS views, COUNT(DISTINCT p.visitorId) AS visitors,
        AVG(p.engagedMs) AS avgMs, SUM(p.sequence = 1) AS entries, SUM(p.sequence = s.pageviews) AS exits
        FROM AnalyticsPageview p JOIN AnalyticsSession s ON s.id = p.sessionId WHERE ${pageWhere} GROUP BY p.path ORDER BY views DESC ${limit}`),
      read(Prisma.sql`SELECT p.route AS route, COUNT(*) AS views, COUNT(DISTINCT p.visitorId) AS visitors, AVG(p.engagedMs) AS avgMs
        FROM AnalyticsPageview p JOIN AnalyticsSession s ON s.id = p.sessionId WHERE ${pageWhere} GROUP BY p.route ORDER BY views DESC ${limit}`),
      read(Prisma.sql`SELECT s.entryPath AS path, ${visitColumns} FROM AnalyticsSession s WHERE ${where} GROUP BY s.entryPath ORDER BY visits DESC ${limit}`),
      read(Prisma.sql`SELECT s.exitPath AS path, COUNT(*) AS exits FROM AnalyticsSession s WHERE ${where} GROUP BY s.exitPath ORDER BY exits DESC ${limit}`),
      read(Prisma.sql`SELECT p.previousPath AS fromPath, p.path AS toPath, COUNT(*) AS count FROM AnalyticsPageview p
        JOIN AnalyticsSession s ON s.id = p.sessionId WHERE ${pageWhere} AND p.previousPath IS NOT NULL
        GROUP BY p.previousPath, p.path ORDER BY count DESC ${limit}`),
      read(Prisma.sql`SELECT j.journey AS journey, COUNT(*) AS visits FROM (
          SELECT p.sessionId, GROUP_CONCAT(p.route ORDER BY p.sequence SEPARATOR '\n') AS journey
          FROM AnalyticsPageview p JOIN AnalyticsSession s ON s.id = p.sessionId WHERE ${where} AND p.sequence <= 4 GROUP BY p.sessionId
        ) j GROUP BY j.journey ORDER BY visits DESC ${limit}`),
      byDimension("s.channel"),
      byDimension("s.referrerHost", Prisma.sql`AND s.referrerHost IS NOT NULL`),
      read(Prisma.sql`SELECT s.utmSource AS source, s.utmMedium AS medium, s.utmCampaign AS campaign, ${visitColumns} FROM AnalyticsSession s
        WHERE ${where} AND (s.utmSource IS NOT NULL OR s.utmMedium IS NOT NULL OR s.utmCampaign IS NOT NULL)
        GROUP BY s.utmSource, s.utmMedium, s.utmCampaign ORDER BY visits DESC ${limit}`),
      byDimension("s.country"),
      read(Prisma.sql`SELECT s.city AS value, MAX(s.country) AS country, ${visitColumns} FROM AnalyticsSession s WHERE ${where}
        GROUP BY s.city ORDER BY visits DESC ${limit}`),
      byDimension("s.browser"),
      byDimension("s.os"),
      byDimension("s.deviceType"),
      byDimension("s.language"),
      byDimension("s.screen"),
      eventRows("click"),
      eventRows("outbound"),
      eventRows("search", false),
      eventRows("download"),
      eventRows("conversion", false),
      read(Prisma.sql`SELECT v.visits AS visits, COUNT(*) AS visitors FROM (
          SELECT COUNT(*) AS visits FROM AnalyticsSession s WHERE ${where} GROUP BY s.visitorId) v GROUP BY v.visits`),
      read(Prisma.sql`SELECT s.visitNumber AS visitNumber, COUNT(*) AS visits FROM AnalyticsSession s WHERE ${where} GROUP BY s.visitNumber`),
    ]);
    const dimensionRows = (rows: Row[], label: (value: string | null) => string, none = "(unknown)") =>
      rows.map((row) => ({ value: text(row.value) ?? none, label: label(text(row.value)), ...visitMetrics(row) }));
    const buckets = (rows: Row[], key: string, count: string, bands: readonly (readonly [string, number, number])[]) => {
      const total = rows.reduce((sum, row) => sum + num(row[count]), 0);
      return bands.map(([label, low, high]) => {
        const value = rows.filter((row) => num(row[key]) >= low && num(row[key]) <= high).reduce((sum, row) => sum + num(row[count]), 0);
        return { label, [count]: value, share: ratio(value, total) };
      });
    };
    return {
      pages: pages.map((row) => ({ path: text(row.path), title: text(row.title), views: num(row.views), visitors: num(row.visitors),
        avgMs: Math.round(num(row.avgMs)), entries: num(row.entries), exits: num(row.exits), exitRate: ratio(num(row.exits), num(row.views)) })),
      routes: routes.map((row) => ({ label: analyticsRouteLabel(String(row.route)), route: text(row.route), views: num(row.views),
        visitors: num(row.visitors), avgMs: Math.round(num(row.avgMs)) })),
      entries: entries.map((row) => ({ path: text(row.path), ...visitMetrics(row) })),
      exits: exits.map((row) => ({ path: text(row.path), exits: num(row.exits), share: ratio(num(row.exits), totals.visits) })),
      transitions: transitions.map((row) => ({ from: text(row.fromPath), to: text(row.toPath), count: num(row.count) })),
      journeys: journeys.map((row) => ({ journey: String(row.journey ?? "").split("\n").map(analyticsRouteLabel).join(" → "),
        visits: num(row.visits), share: ratio(num(row.visits), totals.visits) })),
      channels: dimensionRows(channels, (value) => analyticsChannels[value as keyof typeof analyticsChannels] ?? value ?? "Unknown"),
      referrers: dimensionRows(referrers, (value) => value ?? "(none)", "(none)"),
      campaigns: campaigns.map((row) => ({ source: text(row.source), medium: text(row.medium), campaign: text(row.campaign) ?? "(none)", ...visitMetrics(row) })),
      countries: dimensionRows(countries, countryLabel),
      cities: cities.map((row) => ({ value: text(row.value) ?? "(unknown)",
        label: row.value ? `${String(row.value)}, ${countryLabel(text(row.country))}` : "Unknown", ...visitMetrics(row) })),
      browsers: dimensionRows(browsers, (value) => value ?? "Unknown"),
      os: dimensionRows(systems, (value) => value ?? "Unknown"),
      devices: dimensionRows(devices, (value) => deviceLabels[value ?? ""] ?? value ?? "Unknown"),
      languages: dimensionRows(languages, languageLabel),
      screens: dimensionRows(screens, (value) => value ?? "Unknown"),
      clicks: clicks.map((row) => ({ label: text(row.name), target: text(row.target), count: num(row.count), visitors: num(row.visitors) })),
      outbound: outbound.map((row) => ({ host: text(row.name), target: text(row.target), count: num(row.count), visitors: num(row.visitors) })),
      searches: searches.map((row) => ({ term: text(row.name), count: num(row.count), visitors: num(row.visitors) })),
      downloads: downloads.map((row) => ({ file: text(row.name), target: text(row.target), count: num(row.count), visitors: num(row.visitors) })),
      conversions: conversions.map((row) => ({ goal: text(row.name), label: analyticsGoalLabel(String(row.name)), count: num(row.count),
        rate: ratio(num(row.count), totals.visits) })),
      frequency: buckets(frequency, "visits", "visitors", [["1 visit", 1, 1], ["2 visits", 2, 2], ["3–5 visits", 3, 5], ["6–10 visits", 6, 10], ["11+ visits", 11, Infinity]]),
      loyalty: buckets(loyalty, "visitNumber", "visits", [["First visit", 1, 1], ["2nd visit", 2, 2], ["3rd–5th visit", 3, 5], ["6th–10th visit", 6, 10], ["11th visit or later", 11, Infinity]]),
    };
  }

  return Object.freeze({
    async report(query: ReportQuery): Promise<AnalyticsReport> {
      const range = parseDateRange(query.from, query.to);
      const granularity = granularityFor(range);
      const w = reportWindow(range);
      const compared = comparisonRange(range, query.compare);
      const cw = compared ? reportWindow(compared) : null;
      const [current, previous, currentSeries, previousSeries, grid] = await Promise.all([
        summary(w, query.filters), cw ? summary(cw, query.filters) : null,
        series(range, w, granularity, query.filters), compared && cw ? series(compared, cw, granularity, query.filters) : null,
        heatmap(w, query.filters),
      ]);
      return {
        query, range: { ...range, days: rangeDays(range), granularity }, comparison: compared,
        generatedAt: new Date(now()).toISOString(), summary: current, previous, series: currentSeries, previousSeries,
        heatmap: grid, breakdowns: await breakdowns(w, query.filters, current),
      };
    },

    async live(): Promise<LiveReport> {
      const since = new Date(now() - analyticsRules.liveWindowMs);
      const [[totals], pages] = await Promise.all([
        read(Prisma.sql`SELECT COUNT(DISTINCT visitorId) AS visitors, COUNT(*) AS visits FROM AnalyticsSession WHERE lastSeenAt >= ${since}`),
        read(Prisma.sql`SELECT s.exitPath AS path, MAX(p.title) AS title, COUNT(DISTINCT s.visitorId) AS visitors FROM AnalyticsSession s
          LEFT JOIN AnalyticsPageview p ON p.sessionId = s.id AND p.sequence = s.pageviews WHERE s.lastSeenAt >= ${since}
          GROUP BY s.exitPath ORDER BY visitors DESC LIMIT 10`),
      ]);
      return { visitors: num(totals?.visitors), visits: num(totals?.visits), generatedAt: new Date(now()).toISOString(),
        pages: pages.map((row) => ({ path: String(row.path), title: text(row.title), visitors: num(row.visitors) })) };
    },
  });
}
export type AnalyticsReporter = ReturnType<typeof createAnalyticsReporter>;
