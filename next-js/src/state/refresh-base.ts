import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import { FeedPaginationError } from "../domain/feed-pagination-error.ts";
import { liveRefreshRules } from "../domain/live-refresh.ts";
import { matchFeedRules } from "../domain/match-feed-rules.ts";

export type RefreshError = { code: FeedPaginationError["code"] };
/** AbortSignal.any is missing before Chrome 116, Firefox 124 and Safari 17.4, all inside Next 16's default targets. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(signal.reason); break; }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
export async function readJson(href: string, signal: AbortSignal, timeoutMs: number = liveRefreshRules.timeoutMs): Promise<unknown> {
  const response = await fetch(href, { signal: anySignal([signal, AbortSignal.timeout(timeoutMs)]),
    cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new FeedPaginationError(response.status === 403 ? "subscription-required" : response.status === 429 ? "rate-limited" : "unavailable");
  const text = await response.text(), max = matchFeedRules.maximumResponseBytes;
  // A UTF-16 code unit encodes to at most 3 UTF-8 bytes, so only a possibly oversized body is encoded.
  if (text.length > max || (text.length * 3 > max && new TextEncoder().encode(text).length > max)) {
    throw new FeedPaginationError("invalid-response");
  }
  try { return JSON.parse(text); } catch { throw new FeedPaginationError("invalid-response"); }
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
