"use client";

import { matchingFeedCheckpoint, readFeedCheckpoints, writeFeedCheckpoint, type FeedCheckpoint } from "@/domain/feed-navigation";

export const feedNavigationStorageKey = "goal-hint.feed-navigation.v1";
const markerKey = "goalHintFeed";
/** Keep all router-owned fields. This marker identifies one history entry only. */
export function ensureFeedEntry(href: string): string {
  const state = window.history.state as Record<string, unknown> | null;
  const marker = state?.[markerKey] as { href?: unknown; entryId?: unknown } | undefined;
  if (marker?.href === href && typeof marker.entryId === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(marker.entryId)) return marker.entryId;
  const entryId = crypto.randomUUID();
  window.history.replaceState({ ...state, [markerKey]: { href, entryId } }, "");
  return entryId;
}
export function restoreFeedCheckpoint(entryId: string, queryKey: string, href: string, firstPage: number): FeedCheckpoint | null {
  try { return matchingFeedCheckpoint(readFeedCheckpoints(sessionStorage.getItem(feedNavigationStorageKey), Date.now()), entryId, queryKey, href, firstPage); }
  catch { return null; }
}
export function saveFeedCheckpoint(checkpoint: FeedCheckpoint) {
  try {
    const now = Date.now(), entries = readFeedCheckpoints(sessionStorage.getItem(feedNavigationStorageKey), now);
    sessionStorage.setItem(feedNavigationStorageKey, writeFeedCheckpoint(entries, checkpoint, now));
  } catch { /* Storage is optional; validated direct-page navigation remains available. */ }
}
