import "server-only";

import { matchFeedErrorSchema } from "../../domain/match-feed.ts";
import { createMessages } from "../../i18n/messages.ts";
import { MatchFeedError } from "./feed-error.ts";

export const publicMatchHeaders = { "cache-control": "no-store, max-age=0", "cdn-cache-control": "no-store", "x-content-type-options": "nosniff" };

export function publicMatchFailure(error: unknown): Response {
  const failure = error instanceof MatchFeedError ? error : new MatchFeedError("unavailable");
  const code = failure.code, messages = createMessages("en");
  const retryAfterSeconds = code === "rate-limited" ? failure.retryAfterSeconds ?? 60 : code === "unavailable" ? 5 : null;
  const body = matchFeedErrorSchema.parse({ error: { code,
    message: code === "not-found" ? "Match or prediction history was not found." : messages.text(code === "rate-limited" ? "feed.rateLimited" : code === "invalid-query" ? "feed.invalidQuery" : "feed.unavailable"),
    recoverable: code === "rate-limited" || code === "unavailable", retryAfterSeconds } });
  return Response.json(body, { status: code === "invalid-query" ? 400 : code === "not-found" ? 404 : code === "rate-limited" ? 429 : 503,
    headers: { ...publicMatchHeaders, ...(retryAfterSeconds === null ? {} : { "retry-after": String(retryAfterSeconds) }) } });
}
