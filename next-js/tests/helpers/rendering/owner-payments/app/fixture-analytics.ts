import "server-only";
import { breakdownKeys, type AnalyticsReport, type ReportQuery } from "@/domain/analytics";
import { bucketKeys, granularityFor, parseDateRange, rangeDays } from "@/domain/analytics-range";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
import { seed } from "./fixture";

let retentionDays = 395;
let lastPurgedAt: string | null = null;
const retentionState = async () => ({ retentionDays, lastPurgedAt, source: "dashboard" as const });

/** Deterministic reports exercise the real dashboard and authenticated HTTP handlers without SQL. */
async function report(query: ReportQuery): Promise<AnalyticsReport> {
  const range = parseDateRange(query.from, query.to), granularity = granularityFor(range);
  const visits = query.filters.device === "mobile" ? 3 : 10;
  const summary = { visitors: visits, visits, pageviews: visits * 2, pagesPerVisit: 2, avgVisitMs: 60_000,
    bounceRate: 0.2, avgPageMs: 30_000, conversions: 1, conversionRate: 1 / visits, newVisitors: visits - 1, returningVisitors: 1 };
  const breakdowns = Object.fromEntries(breakdownKeys.map(key => [key, []])) as unknown as AnalyticsReport["breakdowns"];
  return { query, range: { ...range, granularity, days: rangeDays(range) }, comparison: null, generatedAt: new Date().toISOString(),
    summary, previous: null, previousSeries: null,
    series: bucketKeys(range, granularity).map(key => ({ key, visitors: visits, visits, pageviews: visits * 2,
      bounceRate: 0.2, avgVisitMs: 60_000, conversions: 1 })),
    heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 1)),
    breakdowns: { ...breakdowns,
      devices: [{ value: "desktop", label: "Desktop", visits: 7, visitors: 7, pageviews: 14 },
        { value: "mobile", label: "Mobile", visits: 3, visitors: 3, pageviews: 6 }],
      pages: [{ path: "/en", title: "Best slips", views: 20, visitors: 10, avgPageMs: 30_000 }],
    } };
}

export async function analyticsServices(): Promise<AnalyticsServices> {
  const services = seed();
  return { ...services, config: { ...services.config, collecting: false, geoSource: "timezone", usingDevelopmentCredentials: false },
    reporter: { report, live: async () => ({ visitors: 2, visits: 2,
      pages: [{ path: "/en", title: "Best slips", visitors: 2 }], generatedAt: new Date().toISOString() }) },
    retention: { state: retentionState,
      async setRetentionDays(days) { retentionDays = days; return retentionState(); },
      async purge() { lastPurgedAt = new Date().toISOString(); return { cutoff: lastPurgedAt, sessions: 0, pageviews: 0,
        events: 0, visitors: 0, adminSessions: 0, loginThrottles: 0 }; },
      maybePurge() {},
    } };
}
