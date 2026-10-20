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
import { adminSessionRules, createAdminAuth, type Admin, type AdminAuth, type VerifyOptions } from "./analytics-auth.ts";
import { createAnalyticsCollector, createCollectLimiter, type AnalyticsCollector } from "./analytics-collector.ts";
import { createAnalyticsReporter, type AnalyticsReporter } from "./analytics-report.ts";
import { createAnalyticsRetention, isRetentionDays, type AnalyticsRetention } from "./analytics-retention.ts";
import type { LoginProblem, LoginStatus } from "../../components/analytics/dashboard/analytics-login.tsx";
import { clientAddress, cookie, empty, isSameOrigin, json, privateHeaders, readCookie, readLimitedBody, redirect } from "../http/private-http.ts";
import { verifyMemberAdminSession } from "../members/member-admin-access.ts";
import { createMemberSessions, memberCookieName } from "../members/member-sessions.ts";

// Moved to the shared private helpers; re-exported so analytics callers are unchanged.
export { clientAddress, cookie, empty, isSameOrigin, json, privateHeaders, readCookie, readLimitedBody, redirect };

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

/** Shared page/API policy: existing owner login, or a verified member whose number is currently allowlisted. */
export async function verifyAdminSession(services: AnalyticsServices, ownerToken: string | undefined,
  memberToken?: string, options?: VerifyOptions): Promise<Admin | null> {
  try {
    const owner = await services.auth?.verify(ownerToken, options);
    if (owner) return owner;
  } catch { /* Member authorization is independent of the owner password configuration. */ }
  const member = await verifyMemberAdminSession(services, memberToken);
  return member ? { username: `member-admin:${member.accountId}`, expiresAt: member.expiresAt, memberAccountId: member.accountId } : null;
}

export function requireAdmin(services: AnalyticsServices, request: Request, options?: VerifyOptions): Promise<Admin | null> {
  return verifyAdminSession(services, readCookie(request, services.config.cookies.session),
    readCookie(request, memberCookieName(services.config.production)), options);
}

const loginStatuses: readonly LoginStatus[] = ["invalid", "locked", "unavailable", "signed-out"];

/** What a sign-in page shows: a configuration problem, or the outcome named by the sign-in handler's fixed redirect. */
export function loginNotice(services: AnalyticsServices, parameters: Record<string, string | string[] | undefined>) {
  const status = typeof parameters.login === "string" && (loginStatuses as readonly string[]).includes(parameters.login) ? parameters.login as LoginStatus : null;
  const retryAfterSeconds = typeof parameters.retry === "string" && /^\d{1,5}$/.test(parameters.retry) ? Number(parameters.retry) : null;
  const problem: LoginProblem = services.config.adminProblem ?? (services.auth ? null : "storage");
  return { status, problem, retryAfterSeconds };
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

/**
 * Sign-in outcomes for the owner audit trail (058 writes them). A refusal never carries the typed username or password.
 * It arrives only when the typed username is the owner's and the attempt was counted: each wrong password and the attempt
 * that started a lock. The username-wide limit then bounds refusals to about 50 an hour however many addresses send them;
 * other usernames, and attempts refused during a lock, write nothing.
 */
export type SignInAuditEvent =
  | Readonly<{ action: "sign-in" | "sign-out"; username: string }>
  | Readonly<{ action: "sign-in-refused"; reason: "invalid" | "locked" }>;
export type SignInOptions = Readonly<{
  /** Where every outcome lands, fixed by the route: never taken from the request. */
  home?: string;
  audit?: ((event: SignInAuditEvent) => Promise<void> | void) | undefined;
}>;

/** An audit failure never blocks signing in or out. */
async function report(audit: SignInOptions["audit"], event: SignInAuditEvent) {
  try { await audit?.(event); } catch { /* Best effort. */ }
}

export function createLoginHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices,
  { home = analyticsRules.dashboardPath, audit }: SignInOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const { config, auth } = await services();
    if (!isSameOrigin(request)) return empty(403);
    if (!auth) return redirect(`${home}?login=unavailable`);
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
    } catch { return redirect(`${home}?login=invalid`); }
    let result;
    try { result = await auth.login(username, password, clientAddress(request.headers)); }
    catch { return redirect(`${home}?login=unavailable`); }
    if ((result.status === "invalid" || (result.status === "locked" && result.newlyLocked)) && result.ownerUsername) {
      // Not awaited, so the response time never shows whether the typed username was the owner's.
      void report(audit, { action: "sign-in-refused", reason: result.status });
    }
    if (result.status === "locked") return redirect(`${home}?login=locked&retry=${result.retryAfterSeconds}`);
    if (result.status !== "signed-in") return redirect(`${home}?login=${result.status}`);
    await report(audit, { action: "sign-in", username: result.username });
    return redirect(home, [
      cookie(config, config.cookies.session, result.token, Math.floor(adminSessionRules.absoluteMs / 1000)),
      cookie(config, config.cookies.exclude, "1", adminSessionRules.excludeMaxAgeSeconds),
    ]);
  };
}

export function createLogoutHandler(services: () => Promise<AnalyticsServices> = getAnalyticsServices,
  { home = analyticsRules.dashboardPath, audit }: SignInOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const resolved = await services(), { config, auth } = resolved;
    if (!isSameOrigin(request)) return empty(403);
    const token = readCookie(request, config.cookies.session);
    // The audit names whose session ended; reading it must not extend the session about to be deleted.
    const memberName = memberCookieName(config.production), memberToken = readCookie(request, memberName);
    const admin = audit ? await verifyAdminSession(resolved, token, memberToken, { touch: false }) : null;
    try {
      await auth?.logout(token);
      if (admin) await report(audit, { action: "sign-out", username: admin.username });
    } catch { /* The cookie is cleared regardless. */ }
    if (memberToken && resolved.database) {
      try { await createMemberSessions({ database: resolved.database, config }).signOut(memberToken); } catch { /* Clear the cookie during an outage too. */ }
    }
    return redirect(`${home}?login=signed-out`, [cookie(config, config.cookies.session, "", 0),
      ...(memberToken ? [cookie(config, memberName, "", 0, "Lax")] : [])]);
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
