import "server-only";

import { feedPerformanceReplySchema } from "../../domain/feed-performance-summary.ts";
import { matchFeedRequestParameters } from "./feed-http.ts";
import { MatchFeedError } from "./feed-error.ts";
import { privateMatchHeaders, publicMatchFailure } from "./public-http.ts";
import { readPublicMatchFeedSummary } from "./public-feed.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { usesSubscriberFeedOracle } from "../../domain/paywall.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";
import { contentAccess } from "../members/gated-reads.ts";

type SummaryReader = (...args: Parameters<typeof readPublicMatchFeedSummary>) => Promise<Pick<StoredMatchFeedResponse, "performance" | "paginationVersion" | "asOf">>;

/** Uses the feed's strict request parser and entitlement rules without building a full list response. */
export function createMatchFeedSummaryHandler(source: SummaryReader,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, resolveAccess = viewerAccessFromRequest) {
  return async (request: Request): Promise<Response> => {
    try {
      const { parameters } = matchFeedRequestParameters(request), asOf = clock.now();
      const initialAccess = await contentAccess(() => resolveAccess(request));
      const initialQuery = parseMatchFeedQuery(parameters, getReportingDate(asOf), { asOf,
        ...(initialAccess.tier === "free" ? { providerOdds: true } : {}) });
      if (initialAccess.tier === "free" && usesSubscriberFeedOracle(initialQuery)) throw new MatchFeedError("subscription-required");
      const data = await source(parameters, {}, { now: () => asOf });
      if (!data.performance) throw new MatchFeedError("unavailable");
      // A long audit must not retain an expired viewer's private filter access.
      const access = await resolveAccess(request);
      const at = utcInstantFromEpochMilliseconds(data.asOf);
      const query = parseMatchFeedQuery(parameters, getReportingDate(at), { asOf: at, providerOdds: true });
      if (access.tier === "free" && usesSubscriberFeedOracle(query)) throw new MatchFeedError("subscription-required");
      return Response.json(feedPerformanceReplySchema.parse({ performance: data.performance,
        paginationVersion: data.paginationVersion, asOf: data.asOf, access: { tier: access.tier, signedIn: access.signedIn } }), { headers: privateMatchHeaders });
    } catch (error) { return publicMatchFailure(error, privateMatchHeaders); }
  };
}

export const readMatchFeedSummary = createMatchFeedSummaryHandler(readPublicMatchFeedSummary);
