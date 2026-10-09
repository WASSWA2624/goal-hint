import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchFeedRules, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";
import { publicMatchFailure, publicMatchHeaders } from "./public-http.ts";

export function createMatchFeedHandler(read: (parameters: URLSearchParams) => Promise<MatchFeedResponse>) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes) throw new MatchFeedError("invalid-query");
      parseMatchFeedQuery(url.searchParams, getReportingDate(utcInstantFromEpochMilliseconds(Date.now())));
      const result = await read(url.searchParams);
      const links = [result.links.next ? `<${result.links.next}>; rel="next"` : null, result.links.previous ? `<${result.links.previous}>; rel="prev"` : null].filter(Boolean).join(", ");
      return Response.json(result, { headers: { ...publicMatchHeaders, ...(links ? { link: links } : {}) } });
    } catch (error) {
      return publicMatchFailure(error);
    }
  };
}
