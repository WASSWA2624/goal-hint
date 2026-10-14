import { z } from "zod";

/**
 * First-party analytics contract shared by the browser tracker, the collector and the dashboard.
 * Definitions of every metric live in docs/analytics.md; keep both in step.
 */
export const analyticsRules = Object.freeze({
  schemaVersion: 1,
  collectPath: "/api/analytics/collect",
  dashboardPath: "/analytics",
  /** A visit ends after 30 minutes without activity in any tab. */
  sessionIdleMs: 30 * 60_000,
  /** Visible pages report engaged time this often, which also keeps live visitors current. */
  heartbeatMs: 30_000,
  /** Engaged time pauses after five minutes without pointer, key, scroll or touch input. */
  idleAfterMs: 5 * 60_000,
  liveWindowMs: 5 * 60_000,
  /** A visit is engaged (not a bounce) with 2+ page views, 10+ seconds engaged or a conversion. */
  engagedVisitMs: 10_000,
  maximumBodyBytes: 16_384,
  maximumEventsPerBatch: 25,
  maximumEngageDeltaMs: 120_000,
  maximumPageEngagedMs: 4 * 3_600_000,
  /** Consent choices are asked again after a year. */
  consentMaxAgeMs: 365 * 86_400_000,
  defaultRetentionDays: 395,
  retentionChoices: Object.freeze([30, 90, 180, 395, 730] as const),
  maximumRangeDays: 1_095,
  topRows: 100,
});

export const analyticsStorageKeys = Object.freeze({
  consent: "goal-hint-analytics-consent",
  visitor: "goal-hint-analytics-visitor",
  session: "goal-hint-analytics-session",
  /** Tab-scoped (session storage): the last page view, so an automatic reload within seconds is not counted twice. */
  lastPage: "goal-hint-analytics-last-page",
});

export type ConsentChoice = "granted" | "denied";

const uuid = z.uuid();
const text = (maximum: number) => z.string().max(maximum);
const path = z.string().min(1).max(512).regex(/^\/[^\s?#]*$/);
const pageviewId = uuid;

export const attributionSchema = z.strictObject({
  source: text(100).optional(),
  medium: text(100).optional(),
  campaign: text(100).optional(),
  term: text(100).optional(),
  content: text(100).optional(),
  /** Which advertising click identifier was present; the identifier itself is never sent. */
  click: z.enum(["google", "microsoft", "meta"]).optional(),
});
export type Attribution = z.infer<typeof attributionSchema>;

export const analyticsEventSchema = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("pageview"), id: pageviewId, path, title: text(200).optional(),
    /** External referrer host for the first page of a visit only. */
    ref: z.string().max(255).regex(/^[a-z0-9.-]+$/).optional(),
    utm: attributionSchema.optional() }),
  z.strictObject({ t: z.literal("engage"), pv: pageviewId, ms: z.int().min(0).max(analyticsRules.maximumEngageDeltaMs) }),
  z.strictObject({ t: z.literal("click"), pv: pageviewId, label: text(120), href: text(512).optional() }),
  z.strictObject({ t: z.literal("outbound"), pv: pageviewId, href: z.url({ protocol: /^https?$/ }).max(2048), label: text(120).optional() }),
  z.strictObject({ t: z.literal("download"), pv: pageviewId, href: text(2048) }),
  z.strictObject({ t: z.literal("search"), pv: pageviewId, term: z.string().min(1).max(200) }),
  z.strictObject({ t: z.literal("custom"), pv: pageviewId, name: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/) }),
]);
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

export const collectPayloadSchema = z.strictObject({
  v: z.literal(analyticsRules.schemaVersion),
  vid: uuid,
  sid: uuid,
  ctx: z.strictObject({
    tz: text(64).optional(),
    lang: text(35).optional(),
    sw: z.int().min(0).max(20_000).optional(),
    sh: z.int().min(0).max(20_000).optional(),
    tp: z.int().min(0).max(32).optional(),
  }),
  events: z.array(analyticsEventSchema).min(1).max(analyticsRules.maximumEventsPerBatch),
});
export type CollectPayload = z.infer<typeof collectPayloadSchema>;

/** Collapse concrete URLs into page templates so every match page counts as one content group. */
export function analyticsRoute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  const route = segments.map((segment, index) => {
    const previous = segments[index - 1];
    if (index === 0 && /^[a-z]{2}$/i.test(segment)) return "[locale]";
    if (previous === "matches") return "[id]";
    if (segments[index - 2] === "matches") return "[slug]";
    if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) return "[date]";
    if (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return "[id]";
    return segment.length > 40 ? "[value]" : segment.toLowerCase();
  });
  return `/${route.join("/")}`.slice(0, 128);
}

const routeLabels: Readonly<Record<string, string>> = Object.freeze({
  "/": "Site root",
  "/[locale]": "Home",
  "/[locale]/predictions/[date]": "Predictions by date",
  "/[locale]/matches/[id]/[slug]": "Match analysis",
  "/[locale]/slips": "Slip builder",
  "/[locale]/help": "Help",
  "/[locale]/how-it-works": "How it works",
  "/[locale]/privacy": "Privacy",
  "/[locale]/terms": "Terms",
  "/[locale]/contact": "Contact",
});

export function analyticsRouteLabel(route: string): string {
  return routeLabels[route] ?? route;
}

/** Conversions are counted once per visit and goal. */
export const analyticsGoals = Object.freeze([
  { id: "match-analysis", label: "Opened a match analysis", kind: "pageview", route: "/[locale]/matches/[id]/[slug]" },
  { id: "slip-built", label: "Built a slip", kind: "event", type: "custom", name: "slip_build" },
  { id: "source-click", label: "Followed a source link", kind: "event", type: "outbound" },
  { id: "match-search", label: "Searched matches", kind: "event", type: "search" },
] as const);
export type AnalyticsGoal = (typeof analyticsGoals)[number];
export type AnalyticsGoalId = AnalyticsGoal["id"];

export function analyticsGoalLabel(id: string): string {
  return analyticsGoals.find((goal) => goal.id === id)?.label ?? id;
}

export const analyticsChannels = Object.freeze({
  direct: "Direct",
  "organic-search": "Organic search",
  "paid-search": "Paid search",
  social: "Social",
  "paid-social": "Paid social",
  email: "Email",
  "ai-assistant": "AI assistants",
  referral: "Referral",
  campaign: "Other campaigns",
});
export type AnalyticsChannel = keyof typeof analyticsChannels;

/** Visit attributes the dashboard can segment by; every one is an indexed-free equality on a visit column. */
export const analyticsFilterKeys = ["device", "browser", "os", "country", "city", "channel", "referrer", "campaign", "visitor", "page", "entry"] as const;
export type AnalyticsFilterKey = (typeof analyticsFilterKeys)[number];

export const analyticsFilterLabels: Readonly<Record<AnalyticsFilterKey, string>> = Object.freeze({
  device: "Device", browser: "Browser", os: "Operating system", country: "Country", city: "City", channel: "Channel",
  referrer: "Referrer", campaign: "Campaign", visitor: "Visitor type", page: "Viewed page", entry: "Entry page",
});

export const comparisonModes = ["previous", "year", "none"] as const;
export type ComparisonMode = (typeof comparisonModes)[number];

const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filterValue = z.string().min(1).max(512);

export const reportQuerySchema = z.strictObject({
  from: reportDate,
  to: reportDate,
  compare: z.enum(comparisonModes).default("previous"),
  filters: z.partialRecord(z.enum(analyticsFilterKeys), filterValue).default({}),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Read the dashboard's query string: from, to, compare and one `f.<key>` per segment filter. */
export function parseReportParameters(parameters: URLSearchParams): ReportQuery {
  const filters: Record<string, string> = {};
  for (const [key, value] of parameters) {
    if (key.startsWith("f.")) filters[key.slice(2)] = value;
  }
  return reportQuerySchema.parse({ from: parameters.get("from"), to: parameters.get("to"),
    compare: parameters.get("compare") ?? undefined, filters });
}

export function reportParameters(query: ReportQuery): URLSearchParams {
  const parameters = new URLSearchParams({ from: query.from, to: query.to, compare: query.compare });
  for (const key of analyticsFilterKeys) {
    const value = query.filters[key];
    if (value !== undefined) parameters.set(`f.${key}`, value);
  }
  return parameters;
}

export type MetricKey = "visitors" | "visits" | "pageviews" | "pagesPerVisit" | "avgVisitMs" | "bounceRate"
  | "avgPageMs" | "conversions" | "conversionRate" | "newVisitors" | "returningVisitors";

export type AnalyticsSummary = Readonly<Record<MetricKey, number>>;

export type SeriesPoint = Readonly<{ key: string; visitors: number; visits: number; pageviews: number;
  bounceRate: number; avgVisitMs: number; conversions: number }>;

export type BreakdownRow = Readonly<Record<string, string | number | null>>;

export const breakdownKeys = ["pages", "routes", "entries", "exits", "transitions", "journeys", "channels", "referrers",
  "campaigns", "countries", "cities", "browsers", "os", "devices", "languages", "screens", "clicks", "outbound",
  "searches", "downloads", "conversions", "frequency", "loyalty"] as const;
export type BreakdownKey = (typeof breakdownKeys)[number];

export type AnalyticsReport = Readonly<{
  query: ReportQuery;
  range: Readonly<{ from: string; to: string; days: number; granularity: "hour" | "day" | "week" }>;
  comparison: Readonly<{ from: string; to: string }> | null;
  generatedAt: string;
  summary: AnalyticsSummary;
  previous: AnalyticsSummary | null;
  series: readonly SeriesPoint[];
  previousSeries: readonly SeriesPoint[] | null;
  heatmap: readonly (readonly number[])[];
  breakdowns: Readonly<Record<BreakdownKey, readonly BreakdownRow[]>>;
}>;

export type LiveReport = Readonly<{
  visitors: number;
  visits: number;
  pages: readonly Readonly<{ path: string; title: string | null; visitors: number }>[];
  generatedAt: string;
}>;
