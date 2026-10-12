export class FeedPaginationError extends Error {
  readonly code: "changed" | "invalid-response" | "stale-data" | "unavailable" | "rate-limited";
  constructor(code: FeedPaginationError["code"]) {
    super("Match pagination could not be completed."); this.name = "FeedPaginationError"; this.code = code;
  }
}
