"use client";

import type { ReportingDate } from "@/domain/calendar";
import { checkedFeedPage, feedPageApiHref, FeedPaginationError } from "@/domain/feed-pagination";
import type { FeedQuery } from "@/domain/feed-query";
import { matchFeedRules } from "@/domain/match-feed";

/** Only the anonymous stored-data endpoint is called, with pinned reporting dates. */
export async function fetchFeedPage(query: FeedQuery, today: ReportingDate, page: number, signal: AbortSignal) {
  const response = await fetch(feedPageApiHref(query, today, page), { signal, cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new FeedPaginationError(response.status === 429 ? "rate-limited" : "unavailable");
  const text = await response.text();
  if (text.length > matchFeedRules.maximumResponseBytes || new TextEncoder().encode(text).length > matchFeedRules.maximumResponseBytes) {
    throw new FeedPaginationError("invalid-response");
  }
  try { return checkedFeedPage(JSON.parse(text), query, today, page); }
  catch (error) { if (error instanceof FeedPaginationError) throw error; throw new FeedPaginationError("invalid-response"); }
}
