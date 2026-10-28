import type { ReportingDate } from "../domain/calendar.ts";
import { checkedFeedPage, FeedPaginationError, feedPageApiHref } from "../domain/feed-pagination.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import type { MatchFeedResponse } from "../domain/match-feed.ts";
import { feedPerformanceApiHref, feedPerformanceReplySchema, type FeedPerformanceReply } from "../domain/feed-performance-summary.ts";
import { failure, publicRefreshApi, readJson } from "./refresh-base.ts";

export { consumeRefresh } from "./refresh-base.ts";

/** Feed-only endpoints share the base cache and do not enter the initial match-detail bundle. */
export const refreshApi = publicRefreshApi.injectEndpoints({
  overrideExisting: process.env.NODE_ENV === "development",
  endpoints: (build) => ({
    feedSummary: build.query<FeedPerformanceReply, { query: FeedQuery; today: ReportingDate }>({
      serializeQueryArgs: ({ queryArgs: { query, today } }) => feedPerformanceApiHref(query, today),
      async queryFn({ query, today }, api) {
        try {
          const parsed = feedPerformanceReplySchema.safeParse(await readJson(feedPerformanceApiHref(query, today), api.signal, 90_000));
          if (!parsed.success) throw new FeedPaginationError("invalid-response");
          return { data: parsed.data };
        }
        catch (cause) { return failure(cause); }
      },
    }),
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
