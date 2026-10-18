import "server-only";

import { ZodError } from "zod";
import { breakdownKeys, collectPayloadSchema, parseReportParameters, analyticsRules, type AnalyticsReport, type BreakdownKey } from "../../domain/analytics.ts";
import { isBotUserAgent } from "../../domain/analytics-classify.ts";
import { analyticsDatasets, csvHeader, csvValue, formatDuration } from "../../domain/analytics-datasets.ts";
import { toCsv } from "../../domain/analytics-csv.ts";
import { parseDateRange } from "../../domain/analytics-range.ts";
import { CalendarValidationError } from "../../domain/calendar.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { getAnalyticsConfig, type AnalyticsConfig } from "./analytics-config.ts";
import { adminSessionRules, createAdminAuth, type Admin, type AdminAuth } from "./analytics-auth.ts";
import { createAnalyticsCollector, createCollectLimiter, type AnalyticsCollector } from "./analytics-collector.ts";
import { createAnalyticsReporter, type AnalyticsReporter } from "./analytics-report.ts";
import { createAnalyticsRetention, isRetentionDays, type AnalyticsRetention } from "./analytics-retention.ts";

export type AnalyticsServices = Readonly<{
  config: AnalyticsConfig;
  database: DatabaseRuntime | null;
  auth: AdminAuth | null;
  collector: AnalyticsCollector | null;
  reporter: AnalyticsReporter | null;
  retention: AnalyticsRetention | null;
  limiter: ReturnType<typeof createCollectLimiter>;
}>;

export function createAnalyticsServices(config: AnalyticsConfig, database: DatabaseRuntime | null): AnalyticsServices {
  return Object.freeze({
    config, database,
    auth: database ? createAdminAuth({ database, config }) : null,
    collector: database && config.collecting ? createAnalyticsCollector({ database, config }) : null,
    reporter: database ? createAnalyticsReporter(database) : null,
    retention: database ? createAnalyticsRetention(database, { defaultDays: config.retentionDays }) : null,
    limiter: createCollectLimiter(),
  });
}

const processState = globalThis as typeof globalThis & { goalHintAnalytics?: Promise<AnalyticsServices> };

export function getAnalyticsServices(): Promise<AnalyticsServices> {
  processState.goalHintAnalytics ??= (async () => {
    const config = await getAnalyticsConfig();
    let database: DatabaseRuntime | null = null;
    // A site without the database capability still serves pages; analytics simply stays off.
    try { database = getDatabase(); } catch { database = null; }
    return createAnalyticsServices(config, database);
  })();
  return processState.goalHintAnalytics;
}

const privateHeaders = Object.freeze({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...privateHeaders, ...headers } });
const empty = (status: number) => new Response(null, { status, headers: privateHeaders });

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      // A malformed escape still counts as present; the raw value never verifies as a session token.
      const raw = part.slice(index + 1).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return undefined;
}

/** Reads at most `limit` body bytes, or null when the body is larger; chunked requests carry no Content-Length to check first. */
async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function cookie(config: AnalyticsConfig, name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${config.cookies.secure ? "; Secure" : ""}`;
}

/** State-changing requests must come from this site's own pages (Fetch Metadata, then Origin). */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin === null || host === null) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** The address seen by the nearest proxy (the last X-Forwarded-For entry); used only as an HMAC throttle key. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? headers.get("x-real-ip")?.trim() ?? "unknown";
}

export async function requireAdmin(services: AnalyticsServices, request: Request): Promise<Admin | null> {
  if (!services.auth) return null;
  try { return await services.auth.verify(readCookie(request, services.config.cookies.session)); } catch { return null; }
}

function edgeLocation(config: AnalyticsConfig, headers: Headers) {
  const decode = (value: string | null) => { try { return value ? decodeURIComponent(value) : null; } catch { return null; } };
  if (config.geoSource === "cloudflare") return { country: headers.get("cf-ipcountry"), city: decode(headers.get("cf-ipcity")) };
  if (config.geoSource === "vercel") return { country: headers.get("x-vercel-ip-country"), city: decode(headers.get("x-vercel-ip-city")) };
  return null;
}

export function createCollectHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return async function POST(request: Request): Promise<Response> {
    const { config, collector, limiter, retention } = await services();
    if (!collector) return empty(204);
    if (!isSameOrigin(request)) return empty(403);
    const headers = request.headers;
    // Browser privacy signals and administrator browsers are honoured on the server too, not only by the script.
    if (headers.get("sec-gpc") === "1" || headers.get("dnt") === "1") return empty(204);
    if (readCookie(request, config.cookies.session) !== undefined || readCookie(request, config.cookies.exclude) !== undefined) return empty(204);
    const userAgent = headers.get("user-agent");
    if (isBotUserAgent(userAgent)) return empty(204);
    if (Number(headers.get("content-length") ?? 0) > analyticsRules.maximumBodyBytes) return empty(413);
    const bytes = await readLimitedBody(request, analyticsRules.maximumBodyBytes);
    if (bytes === null) return empty(413);
    // Decoded exactly as request.text() would (BOM and invalid UTF-8 handling included).
    const body = await new Response(bytes).text();
    if (Buffer.byteLength(body, "utf8") > analyticsRules.maximumBodyBytes) return empty(413);
    let payload;
    try { payload = collectPayloadSchema.parse(JSON.parse(body)); } catch { return empty(400); }
    if (!limiter.allow(payload.sid, payload.events.length)) return empty(429);
    try {
      await collector.collect(payload, { userAgent: userAgent ?? "", mobileHint: headers.get("sec-ch-ua-mobile") === "?1" ? true
        : headers.get("sec-ch-ua-mobile") === "?0" ? false : null, host: headers.get("x-forwarded-host") ?? headers.get("host") ?? "",
        edge: edgeLocation(config, headers) });
    } catch { return empty(503); }
    retention?.maybePurge();
    return empty(204);
  };
}

/** Lets the consent banner appear only where collection is actually configured. Reveals no settings. */
export function createCollectStatusHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return async function GET(): Promise<Response> {
    const { collector } = await services();
    return json({ enabled: collector !== null });
  };
}

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ ...privateHeaders, Location: location });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
};

export function createLoginHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return async function POST(request: Request): Promise<Response> {
    const { config, auth } = await services();
    if (!isSameOrigin(request)) return empty(403);
    if (!auth) return redirect(`${analyticsRules.dashboardPath}?login=unavailable`);
    if (Number(request.headers.get("content-length") ?? 0) > 4_096) return empty(413);
    let username = "", password = "";
    try {
      const bytes = await readLimitedBody(request, 4_096);
      if (bytes === null) return empty(413);
      // Parsed exactly as request.formData() would, from the same bytes and Content-Type.
      const type = request.headers.get("content-type");
      const form = await new Response(bytes, type === null ? {} : { headers: { "content-type": type } }).formData();
      username = String(form.get("username") ?? "").slice(0, 128);
      password = String(form.get("password") ?? "").slice(0, 1024);
    } catch { return redirect(`${analyticsRules.dashboardPath}?login=invalid`); }
    let result;
    try { result = await auth.login(username, password, clientAddress(request.headers)); }
    catch { return redirect(`${analyticsRules.dashboardPath}?login=unavailable`); }
    if (result.status === "locked") return redirect(`${analyticsRules.dashboardPath}?login=locked&retry=${result.retryAfterSeconds}`);
    if (result.status !== "signed-in") return redirect(`${analyticsRules.dashboardPath}?login=${result.status}`);
    return redirect(analyticsRules.dashboardPath, [
      cookie(config, config.cookies.session, result.token, Math.floor(adminSessionRules.absoluteMs / 1000)),
      cookie(config, config.cookies.exclude, "1", adminSessionRules.excludeMaxAgeSeconds),
    ]);
  };
}

export function createLogoutHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return async function POST(request: Request): Promise<Response> {
    const { config, auth } = await services();
    if (!isSameOrigin(request)) return empty(403);
    try { await auth?.logout(readCookie(request, config.cookies.session)); } catch { /* The cookie is cleared regardless. */ }
    return redirect(`${analyticsRules.dashboardPath}?login=signed-out`, [cookie(config, config.cookies.session, "", 0)]);
  };
}

function reportFailure(error: unknown): Response {
  if (error instanceof ZodError || error instanceof RangeError || error instanceof CalendarValidationError) {
    return json({ error: "invalid-query", message: error instanceof ZodError ? "Choose a valid period and filters." : error.message }, 400);
  }
  return json({ error: "unavailable", message: "Analytics data is temporarily unavailable." }, 503);
}

type Guarded = (context: { services: AnalyticsServices; reporter: AnalyticsReporter; request: Request }) => Promise<Response>;
function guarded(handler: Guarded, services: () => Promise<AnalyticsServices>) {
  return async (request: Request): Promise<Response> => {
    const resolved = await services();
    if (!resolved.reporter) return json({ error: "unavailable", message: "Analytics storage is not configured." }, 503);
    if (!(await requireAdmin(resolved, request))) return json({ error: "unauthorized", message: "Sign in to view analytics." }, 401);
    try { return await handler({ services: resolved, reporter: resolved.reporter, request }); } catch (error) { return reportFailure(error); }
  };
}

/** Parse and validate the period before any query runs: real dates, in order, at most three years. */
function reportQuery(parameters: URLSearchParams) {
  const query = parseReportParameters(parameters);
  parseDateRange(query.from, query.to);
  return query;
}

export function createReportHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return guarded(async ({ reporter, request }) => json(await reporter.report(reportQuery(new URL(request.url).searchParams))), services);
}

export function createLiveHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return guarded(async ({ reporter }) => json(await reporter.live()), services);
}

const summaryRows = (report: AnalyticsReport) => {
  const labels: Record<keyof AnalyticsReport["summary"], [string, "count" | "percent" | "duration" | "decimal"]> = {
    visitors: ["Unique visitors", "count"], visits: ["Visits", "count"], pageviews: ["Page views", "count"],
    pagesPerVisit: ["Pages per visit", "decimal"], avgVisitMs: ["Avg. visit duration (seconds)", "duration"],
    bounceRate: ["Bounce rate (%)", "percent"], avgPageMs: ["Avg. time on page (seconds)", "duration"],
    conversions: ["Conversions", "count"], conversionRate: ["Conversion rate (%)", "percent"],
    newVisitors: ["New visitors", "count"], returningVisitors: ["Returning visitors", "count"],
  };
  return (Object.keys(labels) as (keyof typeof labels)[]).map((key) => {
    const [label, kind] = labels[key];
    const value = (summary: AnalyticsReport["summary"] | null) => summary ? csvValue(summary[key], kind) : null;
    return { metric: label, current: value(report.summary), previous: value(report.previous) };
  });
};

export function createExportHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  return guarded(async ({ reporter, request }) => {
    const parameters = new URL(request.url).searchParams;
    const dataset = parameters.get("dataset") ?? "";
    if (dataset !== "summary" && dataset !== "timeseries" && !(breakdownKeys as readonly string[]).includes(dataset)) {
      return json({ error: "invalid-query", message: "Unknown export dataset." }, 400);
    }
    const report = await reporter.report(reportQuery(parameters));
    let csv: string;
    if (dataset === "summary") {
      csv = toCsv([{ header: "Metric", value: (row) => row.metric }, { header: `${report.range.from} to ${report.range.to}`, value: (row) => row.current },
        { header: report.comparison ? `${report.comparison.from} to ${report.comparison.to}` : "Comparison", value: (row) => row.previous }], summaryRows(report));
    } else if (dataset === "timeseries") {
      csv = toCsv([{ header: report.range.granularity === "hour" ? "Hour (EAT)" : report.range.granularity === "week" ? "Week starting" : "Date",
        value: (row) => row.key }, { header: "Visitors", value: (row) => row.visitors }, { header: "Visits", value: (row) => row.visits },
      { header: "Page views", value: (row) => row.pageviews }, { header: "Bounce rate (%)", value: (row) => csvValue(row.bounceRate, "percent") },
      { header: "Avg. visit (seconds)", value: (row) => csvValue(row.avgVisitMs, "duration") }, { header: "Conversions", value: (row) => row.conversions }],
      report.series);
    } else {
      const definition = analyticsDatasets[dataset as BreakdownKey];
      csv = toCsv(definition.columns.map((column) => ({ header: csvHeader(column), value: (row: Record<string, unknown>) =>
        csvValue(row[column.key] as string | number | null, column.kind) })), report.breakdowns[dataset as BreakdownKey]);
    }
    const name = `goalhint-analytics-${dataset}-${report.range.from}-to-${report.range.to}.csv`;
    return new Response(csv, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"` } });
  }, services);
}

export function createSettingsHandlers(services: () => Promise<AnalyticsServices> = getAnalyticsServices) {
  async function describe(resolved: AnalyticsServices, request: Request) {
    const retention = await resolved.retention!.state();
    return { retention, retentionChoices: analyticsRules.retentionChoices, collecting: resolved.config.collecting,
      geoSource: resolved.config.geoSource, usingDevelopmentCredentials: resolved.config.usingDevelopmentCredentials,
      browserExcluded: readCookie(request, resolved.config.cookies.exclude) !== undefined,
      sessionIdle: formatDuration(analyticsRules.sessionIdleMs) };
  }
  return {
    GET: guarded(async ({ services: resolved, request }) => json(await describe(resolved, request)), services),
    POST: guarded(async ({ services: resolved, request }) => {
      if (!isSameOrigin(request)) return json({ error: "forbidden", message: "Cross-site requests are refused." }, 403);
      let body: { action?: unknown; days?: unknown };
      try { body = await request.json(); } catch { return json({ error: "invalid-query", message: "Send a JSON body." }, 400); }
      if (body.action === "retention") {
        if (!isRetentionDays(body.days)) return json({ error: "invalid-query", message: "Retention must be 1-1095 whole days." }, 400);
        await resolved.retention!.setRetentionDays(body.days);
        // Purge first so the response reports the purge that just ran.
        const purged = await resolved.retention!.purge();
        return json({ ...(await describe(resolved, request)), purged });
      }
      if (body.action === "purge") {
        const purged = await resolved.retention!.purge();
        return json({ ...(await describe(resolved, request)), purged });
      }
      return json({ error: "invalid-query", message: "Unknown settings action." }, 400);
    }, services),
  };
}
