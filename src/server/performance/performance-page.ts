import "server-only";

import { getReportingDate, type Clock } from "../../domain/calendar.ts";
import { performanceResponseSchema, type PerformanceResponse } from "../../domain/performance.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery, type PerformanceQuery } from "./performance-query.ts";
import { readPublicPerformance } from "./public-performance.ts";

export type PerformancePageResult = Readonly<{ query: PerformanceQuery | null; data: PerformanceResponse | null;
  error: "invalid-query" | "unavailable" | "rate-limited" | null }>;

export function performanceParameters(query: PerformanceQuery) {
  const parameters = new URLSearchParams({ from: query.range.startDate, to: query.range.endDate, market: query.market, source: query.source });
  if (query.model) parameters.set("model", query.model);
  if (query.version) parameters.set("version", query.version);
  parameters.sort();
  return parameters;
}

/** Invalid inputs never resolve storage; read failures never masquerade as empty cohorts. */
export async function loadPerformancePage(input: Record<string, string | string[] | undefined>, clock: Clock,
  read: typeof readPublicPerformance = readPublicPerformance): Promise<PerformancePageResult> {
  let query: PerformanceQuery;
  try {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === "" && ["model", "version"].includes(key)) continue;
      if (typeof value !== "string") throw new MatchFeedError("invalid-query");
      parameters.set(key, value);
    }
    query = parsePerformanceQuery(parameters, getReportingDate(clock.now()));
  } catch { return { query: null, data: null, error: "invalid-query" }; }
  try {
    const data = performanceResponseSchema.parse(await read(performanceParameters(query), clock));
    if (data.cohort.from !== query.range.startDate || data.cohort.to !== query.range.endDate ||
        data.filters.market !== query.market || data.filters.source !== query.source || data.filters.model !== query.model ||
        data.filters.version !== query.version) throw new MatchFeedError("unavailable");
    return { query, data, error: null };
  } catch (error) {
    return { query, data: null, error: error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "unavailable" };
  }
}
