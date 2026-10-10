import { FeedPaginationError } from "../domain/feed-pagination.ts";
import { matchDetailResponseSchema, type MatchDetailResponse } from "../domain/match-detail.ts";
import { insightSectionResponseSchema, insightSectionSchemas, type InsightSections } from "../domain/match-insights.ts";
import { matchSections, type MatchSection } from "../domain/match-view.ts";
import { failure, readJson, refreshApi } from "./refresh-api.ts";

/** Match-page reads share the feed's reducer, middleware and cache; only the match page loads their schemas. */
export const detailApi = refreshApi.injectEndpoints({
  // Fast Refresh re-evaluates this module alone; development replaces the endpoint bodies instead of keeping stale ones.
  overrideExisting: process.env.NODE_ENV === "development",
  endpoints: (build) => ({
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
