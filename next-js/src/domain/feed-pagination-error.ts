export class FeedPaginationError extends Error {
  readonly code: "changed" | "invalid-response" | "stale-data" | "unavailable" | "rate-limited" | "subscription-required";
  readonly retryAfterMs: number | undefined;
  constructor(code: FeedPaginationError["code"], retryAfterMs?: number) {
    super("Match pagination could not be completed."); this.name = "FeedPaginationError"; this.code = code; this.retryAfterMs = retryAfterMs;
  }
}
