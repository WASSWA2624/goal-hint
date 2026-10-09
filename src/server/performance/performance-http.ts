import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { performanceResponseSchema, type PerformanceResponse } from "../../domain/performance.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { publicMatchFailure, publicMatchHeaders } from "../matches/public-http.ts";
import { parsePerformanceQuery } from "./performance-query.ts";

export function createPerformanceHandler(read: (parameters: URLSearchParams) => Promise<PerformanceResponse>) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes) throw new MatchFeedError("invalid-query");
      parsePerformanceQuery(url.searchParams, getReportingDate(utcInstantFromEpochMilliseconds(Date.now())));
      const body = performanceResponseSchema.parse(await read(url.searchParams));
      if (Buffer.byteLength(JSON.stringify(body), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
      return Response.json(body, { headers: publicMatchHeaders });
    } catch (error) { return publicMatchFailure(error); }
  };
}
