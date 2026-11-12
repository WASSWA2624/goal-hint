import { z } from "zod";
import { contentAccessSchema } from "./content-access.ts";
import { FeedPaginationError, feedPageApiHref } from "./feed-pagination.ts";
import { feedQueryRules, type FeedQuery } from "./feed-query.ts";
import type { ReportingDate } from "./calendar.ts";
import { feedPerformanceSchema, type MatchFeedResponse } from "./match-feed.ts";

export const feedPerformanceReplySchema = z.strictObject({
  performance: feedPerformanceSchema,
  paginationVersion: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  asOf: z.number().int(), access: contentAccessSchema,
});
export type FeedPerformanceReply = z.infer<typeof feedPerformanceReplySchema>;
/** A server-started read is tied to its canonical summary scope, never the visible list page. */
export type FeedPerformanceSeed = Readonly<{ href: string; reply: FeedPerformanceReply | null }>;

export function feedPerformanceApiHref(query: FeedQuery, today: ReportingDate): string {
  return feedPageApiHref(performanceFeedQuery(query), today, 1).replace("/api/matches?", "/api/matches/summary?");
}

/** A list with no available picks has no outcomes to audit. Use its own count and generation.
 * A settled-result drilldown narrows the list and therefore cannot establish the period total. */
export function emptyFeedPerformanceReply(query: FeedQuery, data: MatchFeedResponse): FeedPerformanceReply | null {
  const picks = data.coverage.matchingWithPerformancePick ?? data.coverage.matchingWithMarket;
  if (query.result || data.state === "data-unavailable" || picks !== 0 || !data.performanceVersion) return null;
  return { performance: { total: data.total, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0, unavailable: data.total },
    paginationVersion: data.performanceVersion, asOf: data.asOf, access: data.access };
}

/** A late aggregate must still belong to the visible cohort and viewer. */
export function checkedFeedPerformance(value: unknown, data: MatchFeedResponse): FeedPerformanceReply {
  const parsed = feedPerformanceReplySchema.safeParse(value);
  if (!parsed.success) throw new FeedPaginationError("invalid-response");
  const reply = parsed.data;
  if (reply.paginationVersion === null || reply.paginationVersion !== data.performanceVersion
    || reply.access.tier !== data.access.tier || reply.access.signedIn !== data.access.signedIn) {
    throw new FeedPaginationError("changed");
  }
  return reply;
}

/** A status navigation can retain confirmed metrics only for the same period snapshot and viewer. */
export function retainedFeedPerformance(seed: FeedPerformanceSeed | null | undefined, href: string, data: MatchFeedResponse): FeedPerformanceSeed | null {
  if (seed?.href !== href || !seed.reply) return null;
  try { checkedFeedPerformance(seed.reply, data); return seed; } catch { return null; }
}

/** Settled-result drilldowns and list ordering never narrow the period metrics. */
export function performanceFeedQuery(query: FeedQuery): FeedQuery {
  const scope = { ...query };
  delete scope.result;
  return { ...scope, page: 1, pageSize: feedQueryRules.pageSize, sort: { by: "kickoff", direction: "desc" } };
}

/** Drill into the cohort represented by the figures, retaining its other filters. */
export function selectFeedSummaryResult(query: FeedQuery, result: FeedQuery["result"]): FeedQuery {
  return { ...query, result, page: 1 };
}
