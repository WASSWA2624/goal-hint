import "server-only";

import type { Clock, ReportingDate } from "../../domain/calendar.ts";
import { serializeFeedQuery, type FeedQuery } from "../../domain/feed-query.ts";
import type { MatchFeedResponse } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readPublicMatchFeed } from "./public-feed.ts";
import { createGatedReads, type AccessResolver } from "../members/gated-reads.ts";
import { resolveViewerAccess } from "../members/viewer-access.ts";

export type FeedPageResult = Readonly<{ data: MatchFeedResponse; error: null } |
  { data: null; error: "rate-limited" | "unavailable" | "subscription-required" }>;

/** Failure cannot become an empty fixture list or a fabricated run count. */
export async function loadMatchFeedPage(query: FeedQuery, today: ReportingDate, clock: Clock,
  read: typeof readPublicMatchFeed = readPublicMatchFeed, resolveAccess: AccessResolver = resolveViewerAccess): Promise<FeedPageResult> {
  try {
    return { data: await createGatedReads({ readFeed: read, resolveAccess }).feed(serializeFeedQuery(query, today), { locale: query.locale }, clock), error: null };
  } catch (error) {
    return { data: null, error: error instanceof MatchFeedError && error.code === "subscription-required" ? "subscription-required"
      : error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "unavailable" };
  }
}
