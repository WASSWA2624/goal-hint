import type { ReportingDate } from "../domain/calendar.ts";
import { checkedFeedPage, FeedPaginationError, feedPageApiHref } from "../domain/feed-pagination.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import type { MatchFeedResponse } from "../domain/match-feed.ts";
import { feedPerformanceApiHref, feedPerformanceReplySchema, type FeedPerformanceReply } from "../domain/feed-performance-summary.ts";
import { failure, publicRefreshApi, readJson } from "./refresh-base.ts";

export { consumeRefresh } from "./refresh-base.ts";

/** Foreground continuations do not inherit the timeout of an in-flight passive poll. */
export async function readRefreshFeedPage(query: FeedQuery, today: ReportingDate, page: number, signal: AbortSignal, timeoutMs?: number) {
  // The browser already has filter options from its initial server read.
  try {
    return checkedFeedPage(await readJson(`${feedPageApiHref(query, today, page)}&leagues=0`, signal, timeoutMs), query, today, page);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof FeedPaginationError) throw error;
    throw new FeedPaginationError("unavailable");
  }
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
