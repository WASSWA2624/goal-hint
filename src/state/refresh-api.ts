import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import type { ReportingDate } from "../domain/calendar.ts";
import { checkedFeedPage, feedPageApiHref, FeedPaginationError } from "../domain/feed-pagination.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import { liveRefreshRules } from "../domain/live-refresh.ts";
import { matchFeedRules, type MatchFeedResponse } from "../domain/match-feed.ts";

export type RefreshError = { code: FeedPaginationError["code"] };
export async function readJson(href: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(href, { signal: AbortSignal.any([signal, AbortSignal.timeout(liveRefreshRules.timeoutMs)]),
    cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new FeedPaginationError(response.status === 429 ? "rate-limited" : "unavailable");
  const text = await response.text(), max = matchFeedRules.maximumResponseBytes;
  // A UTF-16 code unit encodes to at most 3 UTF-8 bytes, so only a possibly oversized body is encoded.
  if (text.length > max || (text.length * 3 > max && new TextEncoder().encode(text).length > max)) {
    throw new FeedPaginationError("invalid-response");
  }
  try { return JSON.parse(text); } catch { throw new FeedPaginationError("invalid-response"); }
}
export function failure(cause: unknown): { error: RefreshError } {
  return { error: { code: cause instanceof FeedPaginationError ? cause.code : "unavailable" } };
}

/**
 * Endpoint identity deduplicates pagination and refresh within a request-owned store. Match-page
 * endpoints are injected by `detail-api.ts`, so the feed bundle carries no detail or insights schemas.
 */
export const refreshApi = createApi({ reducerPath: "publicRefresh", baseQuery: fakeBaseQuery<RefreshError>(), keepUnusedDataFor: 5,
  endpoints: (build) => ({
    feed: build.query<MatchFeedResponse, { query: FeedQuery; today: ReportingDate; page: number }>({
      serializeQueryArgs: ({ queryArgs: { query, today, page } }) => feedPageApiHref(query, today, page),
      async queryFn({ query, today, page }, api) {
        // Polls never read the filter options, so the server omits them (`leagues: []`).
        try { return { data: checkedFeedPage(await readJson(`${feedPageApiHref(query, today, page)}&leagues=0`, api.signal), query, today, page) }; }
        catch (cause) { return failure(cause); }
      },
    }),
  }),
});

/** Unsubscribe this consumer without aborting another subscriber's shared request. */
export async function consumeRefresh<T>(request: { unwrap(): Promise<T>; unsubscribe(): void }, signal: AbortSignal): Promise<T> {
  let canceled: () => void = () => {};
  try {
    const aborted = new Promise<never>((_, reject) => {
      canceled = () => reject(new DOMException("Refresh canceled.", "AbortError"));
      if (signal.aborted) canceled(); else signal.addEventListener("abort", canceled, { once: true });
    });
    return await Promise.race([request.unwrap().catch((cause: RefreshError) => { throw new FeedPaginationError(cause.code ?? "unavailable"); }), aborted]);
  } finally { signal.removeEventListener("abort", canceled); request.unsubscribe(); }
}
