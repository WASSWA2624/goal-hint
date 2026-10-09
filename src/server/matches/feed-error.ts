import "server-only";

export class MatchFeedError extends Error {
  readonly code: "invalid-query" | "rate-limited" | "unavailable";
  readonly retryAfterSeconds: number | null;
  constructor(code: MatchFeedError["code"], retryAfterSeconds: number | null = null) {
    super("Match feed request refused or temporarily unavailable.");
    this.name = "MatchFeedError"; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}
