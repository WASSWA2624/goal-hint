import "server-only";
import { breakdownKeys, type AnalyticsReport } from "@/domain/analytics";
import { bucketKeys, granularityFor, parseDateRange, rangeDays } from "@/domain/analytics-range";
import { parseBestSlipsQuery } from "@/domain/best-slips-query";
import { slipMatchRefreshRequestSchema } from "@/domain/slip-match-refresh";
import { criteria, now, previewBestSlips, previewFeed, previewSlipObservations, syntheticBuild, today, viewer } from "./data";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

function analytics(parameters: URLSearchParams): AnalyticsReport {
  const from = parameters.get("from") ?? "2026-09-14", to = parameters.get("to") ?? today;
  const range = parseDateRange(from, to), granularity = granularityFor(range);
  const summary = { visitors: 2846, visits: 3912, pageviews: 12480, pagesPerVisit: 3.19, avgVisitMs: 184000,
    bounceRate: .28, avgPageMs: 78000, conversions: 428, conversionRate: .1094, newVisitors: 1924, returningVisitors: 922 };
  const breakdowns = Object.fromEntries(breakdownKeys.map(key => [key, []])) as unknown as AnalyticsReport["breakdowns"];
  return { query: { from, to, compare: "none", filters: {} }, range: { ...range, granularity, days: rangeDays(range) },
    comparison: null, generatedAt: "2026-10-13T08:00:00.000Z", summary, previous: null, previousSeries: null,
    series: bucketKeys(range, granularity).map((key, index) => ({ key, visitors: 45 + (index * 17 % 90),
      visits: 60 + (index * 23 % 110), pageviews: 190 + (index * 37 % 200), bounceRate: .28,
      avgVisitMs: 184000, conversions: 8 + index % 12 })),
    heatmap: Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => (day * 11 + hour * 7) % 30)),
    breakdowns: { ...breakdowns,
      devices: [{ value: "mobile", label: "Mobile", visits: 2650, visitors: 1940, pageviews: 8210 },
        { value: "desktop", label: "Desktop", visits: 1120, visitors: 792, pageviews: 3810 },
        { value: "tablet", label: "Tablet", visits: 142, visitors: 114, pageviews: 460 }],
      pages: [{ path: "/en", title: "Best slips", views: 5240, visitors: 2210, avgPageMs: 91000 },
        { path: "/en/matches", title: "Matches", views: 3920, visitors: 1820, avgPageMs: 74000 },
        { path: "/en/slips", title: "Slip builder", views: 2140, visitors: 980, avgPageMs: 123000 }],
      countries: [{ value: "UG", label: "Uganda", visits: 2310, visitors: 1710, pageviews: 7240 },
        { value: "KE", label: "Kenya", visits: 980, visitors: 740, pageviews: 3210 }],
    } };
}

/** Only synthetic reads are supported; the isolated application has no mutation handlers. */
export async function GET(request: Request) {
  const url = new URL(request.url), input = Object.fromEntries(url.searchParams);
  switch (url.pathname) {
    case "/api/best-slips": return json(await previewBestSlips(viewer, parseBestSlipsQuery(url.searchParams, today)));
    case "/api/matches": return json(previewFeed(input).result.data);
    case "/api/matches/summary": {
      const data = previewFeed(input).result.data;
      return json({ performance: { total: data.total, won: 0, lost: 0, pending: data.total, void: 0, unavailable: 0 },
        paginationVersion: data.paginationVersion, asOf: now, access: data.access });
    }
    case "/api/account/session": return json({ phone: "256700000101", administrator: false, subscription: null });
    case "/api/account/slip-configurations": return json({ configurations: [], defaultId: null });
    case "/api/account/notifications": return json({ notifications: [], unread: 0, nextCursor: null });
    case "/api/slips/matches": return json({ asOf: now, states: [] });
    case "/api/slips": return json(syntheticBuild(criteria));
    case "/api/admin/payments/count": return json({ pending: 3 });
    case "/api/admin/payments": return json({ pendingCount: 3, payments: [] });
    case "/api/analytics/report": return json(analytics(url.searchParams));
    case "/api/analytics/live": return json({ visitors: 24, visits: 28, generatedAt: "2026-10-13T08:00:00.000Z",
      pages: [{ path: "/en", title: "Best slips", visitors: 15 }, { path: "/en/matches", title: "Matches", visitors: 9 }] });
    case "/api/analytics/settings": return json({ retention: { retentionDays: 395, source: "default", lastPurgedAt: null },
      retentionChoices: [30, 90, 180, 395], collecting: false, geoSource: "timezone", browserExcluded: true });
    default: return json({ error: "Preview-only endpoint" }, 404);
  }
}

/** The real slip cards poll with POST, but this endpoint only returns observations. */
export async function POST(request: Request) {
  if (new URL(request.url).pathname === "/api/slips/match-states") {
    const input = slipMatchRefreshRequestSchema.safeParse(await request.json());
    if (!input.success) return json({ error: "invalid" }, 400);
    const known = await previewSlipObservations();
    return json({ asOf: now, states: input.data.selections.map(watch => known.get(watch.fixtureId) ?? {
      fixtureId: watch.fixtureId, family: watch.family, selection: watch.selection,
      ...(watch.forecast ? { forecast: watch.forecast } : {}), status: "scheduled", score: null, liveClock: null, outcome: "pending",
    }) });
  }
  return json({ error: "preview-only", message: "Sample preview: changes are disabled." }, 403);
}
