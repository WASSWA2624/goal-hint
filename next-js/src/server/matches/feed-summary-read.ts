import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { feedPerformanceReplySchema } from "../../domain/feed-performance-summary.ts";
import { usesSubscriberFeedOracle } from "../../domain/paywall.ts";
import { contentAccess, type AccessResolver } from "../members/gated-reads.ts";
import { resolveViewerAccessFresh } from "../members/viewer-access.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";
import { readPublicMatchFeedSummary } from "./public-feed.ts";

export type FeedSummarySource = (...args: Parameters<typeof readPublicMatchFeedSummary>) =>
  Promise<Pick<Awaited<ReturnType<typeof readPublicMatchFeedSummary>>, "performance" | "paginationVersion" | "asOf">>;

/** Pages and APIs share the same access checks, including after a long aggregate read. */
export function createGatedFeedSummary(source: FeedSummarySource = readPublicMatchFeedSummary,
  resolveAccess: AccessResolver = resolveViewerAccessFresh) {
  return async (parameters: FeedParameters, clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }) => {
    const at = clock.now(), initialAccess = await contentAccess(resolveAccess);
    const query = parseMatchFeedQuery(parameters, getReportingDate(at), { asOf: at,
      ...(initialAccess.tier === "free" ? { providerOdds: true } : {}) });
    if (initialAccess.tier === "free" && usesSubscriberFeedOracle(query)) throw new MatchFeedError("subscription-required");
    const data = await source(parameters, { completedOnly: false }, { now: () => at });
    if (!data.performance) throw new MatchFeedError("unavailable");
    const access = await contentAccess(resolveAccess);
    if (access.tier === "free" && usesSubscriberFeedOracle(query)) throw new MatchFeedError("subscription-required");
    return feedPerformanceReplySchema.parse({ performance: data.performance, paginationVersion: data.paginationVersion,
      asOf: data.asOf, access: { tier: access.tier, signedIn: access.signedIn } });
  };
}

export const readGatedFeedSummary = createGatedFeedSummary();
