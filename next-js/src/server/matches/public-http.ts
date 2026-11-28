import "server-only";

import { matchFeedErrorSchema } from "../../domain/match-feed.ts";
import { createMessages } from "../../i18n/messages.ts";
import { MatchFeedError } from "./feed-error.ts";

export const publicMatchHeaders = { "cache-control": "no-store, max-age=0", "cdn-cache-control": "no-store", "x-content-type-options": "nosniff" };
export const privateMatchHeaders = { ...publicMatchHeaders, "cache-control": "private, no-store", vary: "Cookie" };

const failureStatus: Readonly<Record<MatchFeedError["code"], number>> = {
  "invalid-query": 400, "not-found": 404, "rate-limited": 429, unavailable: 503, "subscription-required": 403, changed: 409,
};

export function publicMatchFailure(error: unknown, headers: Readonly<Record<string, string>> = publicMatchHeaders): Response {
  const failure = error instanceof MatchFeedError ? error : new MatchFeedError("unavailable");
  const code = failure.code, messages = createMessages("en");
  const retryAfterSeconds = code === "rate-limited" ? failure.retryAfterSeconds ?? 60 : code === "unavailable" ? 5 : null;
  const body = matchFeedErrorSchema.parse({ error: { code,
    message: code === "subscription-required" ? "Premium access is required." : code === "not-found" ? "Match or prediction history was not found."
      : messages.text(code === "rate-limited" ? "feed.rateLimited" : code === "invalid-query" ? "feed.invalidQuery"
        : code === "changed" ? "feed.pagination.changed" : "feed.unavailable"),
    recoverable: code === "rate-limited" || code === "unavailable" || code === "changed", retryAfterSeconds } });
  return Response.json(body, { status: failureStatus[code],
    headers: { ...headers, ...(retryAfterSeconds === null ? {} : { "retry-after": String(retryAfterSeconds) }) } });
}
