import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { feedPerformanceReplySchema } from "../../domain/feed-performance-summary.ts";
import { usesPremiumFeedOracle } from "../../domain/paywall.ts";
import { contentAccess, type AccessResolver } from "../members/gated-reads.ts";
import { resolveViewerContentAccessFresh } from "../members/viewer-access.ts";
import { timedRequestPhase } from "../http/request-timing.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";
import { readPublicMatchFeedSummary } from "./public-feed.ts";

export type FeedSummarySource = (...args: Parameters<typeof readPublicMatchFeedSummary>) =>
  Promise<Pick<Awaited<ReturnType<typeof readPublicMatchFeedSummary>>, "performance" | "paginationVersion" | "performanceScope" | "asOf">>;

/** Pages and APIs share the same access checks, including after a long aggregate read. */
export function createGatedFeedSummary(source: FeedSummarySource = readPublicMatchFeedSummary,
  resolveAccess: AccessResolver = resolveViewerContentAccessFresh) {
  return async (parameters: FeedParameters, clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }) => {
    const at = clock.now(), today = getReportingDate(at);
    const query = parseMatchFeedQuery(parameters, today, { asOf: at, providerOdds: true });
    const protectedScope = usesPremiumFeedOracle(query);
    if (protectedScope) {
      const initialAccess = await timedRequestPhase("summary-initial-access", () => contentAccess(resolveAccess));
      if (initialAccess.tier === "free") throw new MatchFeedError("subscription-required");
      parseMatchFeedQuery(parameters, today, { asOf: at });
    }
    const data = await source(parameters, { completedOnly: false }, { now: () => at });
    if (!data.performance) throw new MatchFeedError("unavailable");
    const access = await timedRequestPhase("summary-access", () => contentAccess(resolveAccess));
    if (access.tier === "free" && protectedScope) throw new MatchFeedError("subscription-required");
    return feedPerformanceReplySchema.parse({ performance: data.performance, paginationVersion: data.paginationVersion,
      ...(data.performanceScope !== undefined ? { performanceScope: data.performanceScope } : {}),
      asOf: data.asOf, access: { tier: access.tier, signedIn: access.signedIn } });
  };
}

export const readGatedFeedSummary = createGatedFeedSummary();
