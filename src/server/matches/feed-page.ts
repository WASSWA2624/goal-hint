import "server-only";

import type { Clock, ReportingDate } from "../../domain/calendar.ts";
import { serializeFeedQuery, type FeedQuery } from "../../domain/feed-query.ts";
import type { MatchFeedResponse } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readPublicMatchFeed } from "./public-feed.ts";

export type FeedPageResult = Readonly<{ data: MatchFeedResponse; error: null } |
  { data: null; error: "rate-limited" | "unavailable" }>;

/** Failure cannot become an empty fixture list or a fabricated run count. */
export async function loadMatchFeedPage(query: FeedQuery, today: ReportingDate, clock: Clock,
  read: typeof readPublicMatchFeed = readPublicMatchFeed): Promise<FeedPageResult> {
  try {
    return { data: await read(serializeFeedQuery(query, today), { locale: query.locale }, clock), error: null };
  } catch (error) {
    return { data: null, error: error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "unavailable" };
  }
}
