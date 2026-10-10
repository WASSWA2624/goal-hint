import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import type { ReportingDate } from "../domain/calendar.ts";
import { checkedFeedPage, feedPageApiHref, FeedPaginationError } from "../domain/feed-pagination.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import { liveRefreshRules } from "../domain/live-refresh.ts";
import { matchDetailResponseSchema, type MatchDetailResponse } from "../domain/match-detail.ts";
import { insightSectionResponseSchema, insightSectionSchemas, type InsightSections } from "../domain/match-insights.ts";
import { matchSections, type MatchSection } from "../domain/match-view.ts";
import { matchFeedRules, type MatchFeedResponse } from "../domain/match-feed.ts";

export type RefreshError = { code: FeedPaginationError["code"] };
async function readJson(href: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(href, { signal: AbortSignal.any([signal, AbortSignal.timeout(liveRefreshRules.timeoutMs)]),
    cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new FeedPaginationError(response.status === 429 ? "rate-limited" : "unavailable");
  const text = await response.text();
  if (text.length > matchFeedRules.maximumResponseBytes || new TextEncoder().encode(text).length > matchFeedRules.maximumResponseBytes) {
    throw new FeedPaginationError("invalid-response");
  }
  try { return JSON.parse(text); } catch { throw new FeedPaginationError("invalid-response"); }
}
function failure(cause: unknown): { error: RefreshError } {
  return { error: { code: cause instanceof FeedPaginationError ? cause.code : "unavailable" } };
}

/** Endpoint identity deduplicates pagination and refresh within a request-owned store. */
export const refreshApi = createApi({ reducerPath: "publicRefresh", baseQuery: fakeBaseQuery<RefreshError>(), keepUnusedDataFor: 5,
  endpoints: (build) => ({
    feed: build.query<MatchFeedResponse, { query: FeedQuery; today: ReportingDate; page: number }>({
      serializeQueryArgs: ({ queryArgs: { query, today, page } }) => feedPageApiHref(query, today, page),
      async queryFn({ query, today, page }, api) {
        try { return { data: checkedFeedPage(await readJson(feedPageApiHref(query, today, page), api.signal), query, today, page) }; }
        catch (cause) { return failure(cause); }
      },
    }),
    /** One complete match-insights section, loaded on first expansion and reused for ten minutes. */
    insights: build.query<{ asOf: number; section: MatchSection; data: InsightSections[MatchSection] }, { id: string; section: MatchSection }>({
      serializeQueryArgs: ({ queryArgs: { id, section } }) => `${id}:${section}`,
      keepUnusedDataFor: 600,
      async queryFn({ id, section }, api) {
        try {
          if (!/^[a-f0-9-]{36}$/u.test(id) || !(matchSections as readonly string[]).includes(section)) throw new FeedPaginationError("invalid-response");
          const parsed = insightSectionResponseSchema.safeParse(await readJson(`/api/matches/${id}/insights?section=${section}`, api.signal));
          if (!parsed.success || parsed.data.fixtureId !== id || parsed.data.section !== section) throw new FeedPaginationError("invalid-response");
          const data = insightSectionSchemas[section].safeParse(parsed.data.data);
          if (!data.success) throw new FeedPaginationError("invalid-response");
          return { data: { asOf: parsed.data.asOf, section, data: data.data } };
        } catch (cause) { return failure(cause); }
      },
    }),
    detail: build.query<MatchDetailResponse, string>({
      async queryFn(id, api) {
        try {
          if (!/^[a-f0-9-]{36}$/u.test(id)) throw new FeedPaginationError("invalid-response");
          const parsed = matchDetailResponseSchema.safeParse(await readJson(`/api/matches/${id}`, api.signal));
          if (!parsed.success || parsed.data.fixture.fixtureId !== id || parsed.data.selection !== "applicable") throw new FeedPaginationError("invalid-response");
          return { data: parsed.data };
        } catch (cause) { return failure(cause); }
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
