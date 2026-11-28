import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import { FeedPaginationError } from "../domain/feed-pagination-error.ts";
import { liveRefreshRules } from "../domain/live-refresh.ts";
import { matchFeedRules } from "../domain/match-feed-rules.ts";
import { startRequestDeadline } from "../domain/request-deadline.ts";

export type RefreshError = { code: FeedPaginationError["code"]; retryAfterMs?: number };

function readFailure(response: Response) {
  const { status } = response;
  const code = status === 401 || status === 403 ? "subscription-required" : status === 409 ? "changed" : status === 429 ? "rate-limited"
    : status >= 500 || status === 408 ? "unavailable" : "invalid-response";
  const header = response.headers.get("retry-after");
  const delay = !header ? NaN : /^\d+$/u.test(header) ? Number(header) * 1_000 : Date.parse(header) - Date.now();
  return new FeedPaginationError(code, Number.isFinite(delay) ? Math.max(0, delay) : undefined);
}

export async function readJson(href: string, signal: AbortSignal, timeoutMs: number = liveRefreshRules.timeoutMs,
  maximumBytes: number = matchFeedRules.maximumResponseBytes): Promise<unknown> {
  const controller = new AbortController();
  const canceled = () => controller.abort(signal.reason), clearDeadline = startRequestDeadline(controller, timeoutMs);
  if (signal.aborted) canceled(); else signal.addEventListener("abort", canceled, { once: true });
  try {
    const response = await fetch(href, { signal: controller.signal,
      cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw readFailure(response);
    const text = await response.text();
    // A UTF-16 code unit encodes to at most 3 UTF-8 bytes, so only a possibly oversized body is encoded.
    if (text.length > maximumBytes || (text.length * 3 > maximumBytes && new TextEncoder().encode(text).length > maximumBytes)) {
      throw new FeedPaginationError("invalid-response");
    }
    try { return JSON.parse(text); } catch { throw new FeedPaginationError("invalid-response"); }
  } finally { clearDeadline(); signal.removeEventListener("abort", canceled); }
}
export function failure(cause: unknown): { error: RefreshError } {
  if (!(cause instanceof FeedPaginationError)) return { error: { code: "unavailable" } };
  return { error: { code: cause.code, ...(cause.retryAfterMs !== undefined && { retryAfterMs: cause.retryAfterMs }) } };
}

/** Each route injects its reads into one cache without importing another route's validators. */
export const publicRefreshApi = createApi({ reducerPath: "publicRefresh", baseQuery: fakeBaseQuery<RefreshError>(),
  keepUnusedDataFor: 5, endpoints: () => ({}) });

/** Unsubscribe this consumer without aborting a request another consumer is using. */
export async function consumeRefresh<T>(request: { unwrap(): Promise<T>; unsubscribe(): void }, signal: AbortSignal): Promise<T> {
  let canceled: () => void = () => {};
  try {
    const aborted = new Promise<never>((_, reject) => {
      canceled = () => reject(new DOMException("Refresh canceled.", "AbortError"));
      if (signal.aborted) canceled(); else signal.addEventListener("abort", canceled, { once: true });
    });
    return await Promise.race([request.unwrap().catch((cause: RefreshError) => {
      throw new FeedPaginationError(cause.code ?? "unavailable", cause.retryAfterMs);
    }), aborted]);
  } finally { signal.removeEventListener("abort", canceled); request.unsubscribe(); }
}
