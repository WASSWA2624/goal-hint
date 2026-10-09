import "server-only";

import { matchFeedRules } from "../../domain/match-feed.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { MatchFeedError } from "./feed-error.ts";

/** Shared aggregate budget: no IP, cookie, visitor token or search text retained. */
export function createMysqlPublicSearchLimiter(database: DatabaseRuntime) {
  return Object.freeze({ async consume() {
    const retryAfter = await database.transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ windowStartedAt: Date; requests: number }[]>`
        SELECT windowStartedAt, requests FROM PublicSearchLimit WHERE scope = 'matches' FOR UPDATE`;
      if (!row) throw new MatchFeedError("unavailable");
      const [time] = await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`;
      if (!time) throw new MatchFeedError("unavailable");
      const { at } = time;
      const now = at.getTime(), start = row.windowStartedAt.getTime();
      if (now < start) throw new MatchFeedError("unavailable");
      if (now >= start + matchFeedRules.searchWindowMs) {
        await tx.publicSearchLimit.update({ where: { scope: "matches" }, data: { windowStartedAt: at, requests: 1 } });
        return null;
      }
      if (row.requests >= matchFeedRules.searchRequestsPerWindow) return Math.max(1, Math.ceil((start + matchFeedRules.searchWindowMs - now) / 1000));
      await tx.publicSearchLimit.update({ where: { scope: "matches" }, data: { requests: { increment: 1 } } });
      return null;
    }, { isolationLevel: "ReadCommitted", timeout: 5000 });
    if (retryAfter !== null) throw new MatchFeedError("rate-limited", retryAfter);
  } });
}
