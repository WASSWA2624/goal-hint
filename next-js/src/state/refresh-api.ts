import type { ReportingDate } from "../domain/calendar.ts";
import type { FeedContinuationPrefix } from "../domain/feed-continuation.ts";
import { checkedFeedPage, checkedFeedWindow, FeedPaginationError, feedContinuationApiHref, feedPageApiHref, feedWindowApiHref } from "../domain/feed-pagination.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import type { MatchFeedResponse } from "../domain/match-feed.ts";
import { maximumFeedWindowBytes } from "../domain/match-feed-rules.ts";
import { feedPerformanceApiHref, feedPerformanceReplySchema, type FeedPerformanceReply } from "../domain/feed-performance-summary.ts";
import { failure, publicRefreshApi, readJson } from "./refresh-base.ts";

export { consumeRefresh } from "./refresh-base.ts";

async function readFeedJson(href: string, signal: AbortSignal, timeoutMs?: number, maximumBytes?: number) {
  try {
    return await readJson(href, signal, timeoutMs, maximumBytes);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof FeedPaginationError) throw error;
    throw new FeedPaginationError("unavailable");
  }
}

/** Foreground continuations do not inherit the timeout of an in-flight passive poll. */
export async function readRefreshFeedPage(query: FeedQuery, today: ReportingDate, page: number, signal: AbortSignal, timeoutMs?: number) {
  // The browser already has filter options from its initial server read.
  return checkedFeedPage(await readFeedJson(`${feedPageApiHref(query, today, page)}&leagues=0`, signal, timeoutMs), query, today, page);
}

export async function readRefreshFeedWindow(query: FeedQuery, today: ReportingDate, firstPage: number, through: number,
  signal: AbortSignal, timeoutMs?: number) {
  return checkedFeedWindow(await readFeedJson(feedWindowApiHref(query, today, firstPage, through), signal, timeoutMs, maximumFeedWindowBytes),
    query, today, firstPage, through);
}

export async function readRefreshFeedContinuation(query: FeedQuery, today: ReportingDate, page: number, prefix: FeedContinuationPrefix,
  signal: AbortSignal, timeoutMs?: number) {
  const result = await readFeedJson(feedContinuationApiHref(query, today, page, prefix), signal, timeoutMs);
  if (!result || typeof result !== "object" || Object.keys(result).length !== 2 || !("prefix" in result)
    || result.prefix !== prefix.hash || !("page" in result)) throw new FeedPaginationError("invalid-response");
  return checkedFeedPage(result.page, query, today, page);
}

/** Feed-only endpoints share the base cache and do not enter the initial match-detail bundle. */
export const refreshApi = publicRefreshApi.injectEndpoints({
  overrideExisting: process.env.NODE_ENV === "development",
  endpoints: (build) => ({
    feedSummary: build.query<FeedPerformanceReply, { query: FeedQuery; today: ReportingDate }>({
      serializeQueryArgs: ({ queryArgs: { query, today } }) => feedPerformanceApiHref(query, today),
      async queryFn({ query, today }, api) {
        try {
          const parsed = feedPerformanceReplySchema.safeParse(await readJson(feedPerformanceApiHref(query, today), api.signal));
          if (!parsed.success) throw new FeedPaginationError("invalid-response");
          return { data: parsed.data };
        }
        catch (cause) { return failure(cause); }
      },
    }),
    feed: build.query<MatchFeedResponse, { query: FeedQuery; today: ReportingDate; page: number }>({
      serializeQueryArgs: ({ queryArgs: { query, today, page } }) => feedPageApiHref(query, today, page),
      async queryFn({ query, today, page }, api) {
        try { return { data: await readRefreshFeedPage(query, today, page, api.signal) }; }
        catch (cause) { return failure(cause); }
      },
    }),
  }),
});
