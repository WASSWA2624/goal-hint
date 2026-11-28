import { z } from "zod";
import { contentAccessSchema } from "./content-access.ts";
import { FeedPaginationError, feedPageApiHref } from "./feed-pagination.ts";
import { feedQueryRules, type FeedQuery } from "./feed-query.ts";
import type { ReportingDate } from "./calendar.ts";
import { feedPerformanceSchema, type MatchFeedResponse } from "./match-feed.ts";

export const feedPerformanceReplySchema = z.strictObject({
  performance: feedPerformanceSchema,
  paginationVersion: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  performanceScope: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  asOf: z.number().int(), access: contentAccessSchema,
});
export type FeedPerformanceReply = z.infer<typeof feedPerformanceReplySchema>;
/** A server-started read is tied to its canonical summary scope, never the visible list page. */
export type FeedPerformanceSeed = Readonly<{ href: string; reply: FeedPerformanceReply | null;
  observed?: true;
  failure?: { code: FeedPaginationError["code"]; retryAt?: number } }>;

export function feedPerformanceApiHref(query: FeedQuery, today: ReportingDate): string {
  return feedPageApiHref(performanceFeedQuery(query), today, 1).replace("/api/matches?", "/api/matches/summary?");
}

/** A list with no available picks has no outcomes to audit. Use its own count and generation.
 * A settled-result drilldown narrows the list and therefore cannot establish the period total. */
export function emptyFeedPerformanceReply(query: FeedQuery, data: MatchFeedResponse): FeedPerformanceReply | null {
  const picks = data.coverage.matchingWithPerformancePick ?? data.coverage.matchingWithMarket;
  if (query.result || data.state === "data-unavailable" || picks !== 0 || !data.performanceVersion) return null;
  return { performance: { total: data.total, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0, unavailable: data.total },
    paginationVersion: data.performanceVersion, ...(data.performanceScope ? { performanceScope: data.performanceScope } : {}),
    asOf: data.asOf, access: data.access };
}

type SummaryObservation = Readonly<{ requestedHref: string; currentHref: string }>;

/** A late aggregate must still belong to the visible cohort and viewer. */
export function checkedFeedPerformance(value: unknown, data: MatchFeedResponse, observation?: SummaryObservation): FeedPerformanceReply {
  const parsed = feedPerformanceReplySchema.safeParse(value);
  if (!parsed.success) throw new FeedPaginationError("invalid-response");
  const reply = parsed.data;
  if (reply.paginationVersion === null || observation && observation.requestedHref !== observation.currentHref
    || reply.access.tier !== data.access.tier || reply.access.signedIn !== data.access.signedIn
    || reply.performanceScope && data.performanceScope && reply.performanceScope !== data.performanceScope) {
    throw new FeedPaginationError("changed");
  }
  if (reply.paginationVersion !== data.performanceVersion) {
    // The digest that includes mutable source generations cannot identify a stable cohort on its own.
    // Only an exact public guest observation can advance independently of the list's generation.
    if (!observation || !reply.performanceScope || reply.performanceScope !== data.performanceScope
      || reply.access.tier !== "free" || reply.access.signedIn || reply.asOf <= data.asOf) {
      throw new FeedPaginationError("changed");
    }
  }
  return reply;
}

export function canReplaceFeedPerformance(current: Pick<FeedPerformanceReply, "asOf" | "paginationVersion">,
  incoming: Pick<FeedPerformanceReply, "asOf" | "paginationVersion">): boolean {
  return incoming.asOf > current.asOf || incoming.asOf === current.asOf && incoming.paginationVersion === current.paginationVersion;
}

/** A status navigation can retain confirmed metrics only for the same period snapshot and viewer. */
export function retainedFeedPerformance(seed: FeedPerformanceSeed | null | undefined, href: string, data: MatchFeedResponse): FeedPerformanceSeed | null {
  if (seed?.href !== href || !seed.reply) return null;
  try {
    checkedFeedPerformance(seed.reply, data, seed.observed ? { requestedHref: seed.href, currentHref: href } : undefined);
    return seed;
  } catch { return null; }
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
