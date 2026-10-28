import "server-only";

import { feedPerformanceReplySchema } from "../../domain/feed-performance-summary.ts";
import { createMatchFeedHandler } from "./feed-http.ts";
import { MatchFeedError } from "./feed-error.ts";
import { privateMatchHeaders, publicMatchFailure } from "./public-http.ts";
import { readPublicMatchFeedSummary } from "./public-feed.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { usesSubscriberFeedOracle } from "../../domain/paywall.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";

/** The ordinary feed boundary owns query validation and entitlement checks. */
export function createMatchFeedSummaryHandler(source: Parameters<typeof createMatchFeedHandler>[0],
  clock?: Parameters<typeof createMatchFeedHandler>[1], resolveAccess = viewerAccessFromRequest) {
  const read = createMatchFeedHandler(source, clock, resolveAccess);
  return async (request: Request): Promise<Response> => {
    const response = await read(request);
    if (!response.ok) return response;
    try {
      const data = await response.json();
      if (!data.performance) throw new MatchFeedError("unavailable");
      // A long audit must not retain an expired viewer's private filter access.
      const access = await resolveAccess(request), parameters = new URL(request.url).searchParams;
      parameters.delete("leagues");
      const at = utcInstantFromEpochMilliseconds(data.asOf);
      const query = parseMatchFeedQuery(parameters, getReportingDate(at), { asOf: at, providerOdds: true });
      if (access.tier === "free" && usesSubscriberFeedOracle(query)) throw new MatchFeedError("subscription-required");
      return Response.json(feedPerformanceReplySchema.parse({ performance: data.performance,
        paginationVersion: data.paginationVersion, asOf: data.asOf, access: { tier: access.tier, signedIn: access.signedIn } }), { headers: privateMatchHeaders });
    } catch (error) { return publicMatchFailure(error, privateMatchHeaders); }
  };
}

export const readMatchFeedSummary = createMatchFeedSummaryHandler(readPublicMatchFeedSummary);
