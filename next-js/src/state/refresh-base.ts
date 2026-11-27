import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import { FeedPaginationError } from "../domain/feed-pagination-error.ts";
import { liveRefreshRules } from "../domain/live-refresh.ts";
import { matchFeedRules } from "../domain/match-feed-rules.ts";
import { startRequestDeadline } from "../domain/request-deadline.ts";

export type RefreshError = { code: FeedPaginationError["code"] };
export async function readJson(href: string, signal: AbortSignal, timeoutMs: number = liveRefreshRules.timeoutMs): Promise<unknown> {
  const controller = new AbortController();
  const canceled = () => controller.abort(signal.reason), clearDeadline = startRequestDeadline(controller, timeoutMs);
  if (signal.aborted) canceled(); else signal.addEventListener("abort", canceled, { once: true });
  try {
    const response = await fetch(href, { signal: controller.signal,
      cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new FeedPaginationError(response.status === 403 ? "subscription-required" : response.status === 429 ? "rate-limited" : "unavailable");
    const text = await response.text(), max = matchFeedRules.maximumResponseBytes;
    // A UTF-16 code unit encodes to at most 3 UTF-8 bytes, so only a possibly oversized body is encoded.
    if (text.length > max || (text.length * 3 > max && new TextEncoder().encode(text).length > max)) {
      throw new FeedPaginationError("invalid-response");
    }
    try { return JSON.parse(text); } catch { throw new FeedPaginationError("invalid-response"); }
  } finally { clearDeadline(); signal.removeEventListener("abort", canceled); }
}
export function failure(cause: unknown): { error: RefreshError } {
  return { error: { code: cause instanceof FeedPaginationError ? cause.code : "unavailable" } };
}

/** Each route injects its reads into one cache without importing another route's validators. */
export const publicRefreshApi = createApi({ reducerPath: "publicRefresh", baseQuery: fakeBaseQuery<RefreshError>(),
  keepUnusedDataFor: 5, endpoints: () => ({}) });

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
