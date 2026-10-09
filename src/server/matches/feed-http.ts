import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchFeedErrorSchema, matchFeedRules, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { createMessages } from "../../i18n/messages.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";

const publicHeaders = { "cache-control": "no-store, max-age=0", "cdn-cache-control": "no-store", "x-content-type-options": "nosniff" };
export function createMatchFeedHandler(read: (parameters: URLSearchParams) => Promise<MatchFeedResponse>) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes) throw new MatchFeedError("invalid-query");
      parseMatchFeedQuery(url.searchParams, getReportingDate(utcInstantFromEpochMilliseconds(Date.now())));
      const result = await read(url.searchParams);
      const links = [result.links.next ? `<${result.links.next}>; rel="next"` : null, result.links.previous ? `<${result.links.previous}>; rel="prev"` : null].filter(Boolean).join(", ");
      return Response.json(result, { headers: { ...publicHeaders, ...(links ? { link: links } : {}) } });
    } catch (error) {
      const failure = error instanceof MatchFeedError ? error : new MatchFeedError("unavailable");
      const code = failure.code, messages = createMessages("en"), retryAfterSeconds = code === "rate-limited" ? failure.retryAfterSeconds ?? 60 : code === "unavailable" ? 5 : null;
      const body = matchFeedErrorSchema.parse({ error: { code, message: messages.text(code === "rate-limited" ? "feed.rateLimited" : code === "invalid-query" ? "feed.invalidQuery" : "feed.unavailable"),
        recoverable: code !== "invalid-query", retryAfterSeconds } });
      return Response.json(body, { status: code === "invalid-query" ? 400 : code === "rate-limited" ? 429 : 503,
        headers: { ...publicHeaders, ...(retryAfterSeconds === null ? {} : { "retry-after": String(retryAfterSeconds) }) } });
    }
  };
}
