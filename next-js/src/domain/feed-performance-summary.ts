import { z } from "zod";
import { contentAccessSchema } from "./content-access.ts";
import { FeedPaginationError, feedPageApiHref } from "./feed-pagination.ts";
import type { FeedQuery } from "./feed-query.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "./calendar.ts";
import { publicPolicy } from "./public-policy.ts";
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
  return feedPageApiHref(query, today, query.page).replace("/api/matches?", "/api/matches/summary?");
}

/** A late aggregate must still belong to the visible cohort and viewer. */
export function checkedFeedPerformance(value: unknown, data: MatchFeedResponse): FeedPerformanceReply {
  const parsed = feedPerformanceReplySchema.safeParse(value);
  if (!parsed.success) throw new FeedPaginationError("invalid-response");
  const reply = parsed.data;
  if (reply.performance.total !== data.total || reply.paginationVersion !== data.paginationVersion
    || reply.access.tier !== data.access.tier || reply.access.signedIn !== data.access.signedIn) {
    throw new FeedPaginationError("changed");
  }
  return reply;
}

/** Summary dates are independent from the browsing window on the entry screen. */
export function performanceFeedQuery(query: FeedQuery, today: ReportingDate, asOf?: number): FeedQuery {
  const reportingToday = asOf === undefined ? today : getReportingDate(utcInstantFromEpochMilliseconds(asOf));
  return query.summary === "yesterday" ? { ...query, summary: undefined, result: undefined, zone: publicPolicy.reportingTimeZone, time: null,
    dates: { kind: "date", date: addReportingDays(reportingToday, -1) }, status: "all", page: 1 } : { ...query, result: undefined, page: 1 };
}
export function checkedPeriodPerformance(value: unknown, data: MatchFeedResponse): FeedPerformanceReply {
  const parsed = feedPerformanceReplySchema.safeParse(value);
  if (!parsed.success) throw new FeedPaginationError("invalid-response");
  if (parsed.data.access.tier !== data.access.tier || parsed.data.access.signedIn !== data.access.signedIn) throw new FeedPaginationError("changed");
  return parsed.data;
}

/** Drill into the cohort represented by the figures, retaining its other filters. */
export function selectFeedSummaryResult(query: FeedQuery, result: FeedQuery["result"], today: ReportingDate, asOf: number): FeedQuery {
  const scope = performanceFeedQuery(query, today, asOf);
  return { ...scope, dates: query.summary === "yesterday" ? { kind: "yesterday" } : scope.dates, result, page: 1 };
}
