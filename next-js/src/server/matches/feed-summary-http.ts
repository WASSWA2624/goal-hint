import "server-only";

import { matchFeedRequestParameters } from "./feed-http.ts";
import { privateMatchHeaders, publicMatchFailure } from "./public-http.ts";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { viewerContentAccessFromRequest } from "../members/viewer-access.ts";
import { createGatedFeedSummary, type FeedSummarySource } from "./feed-summary-read.ts";

/** Uses the feed's strict request parser and entitlement rules without building a full list response. */
export function createMatchFeedSummaryHandler(source: FeedSummarySource,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, resolveAccess = viewerContentAccessFromRequest) {
  return async (request: Request): Promise<Response> => {
    try {
      const { parameters } = matchFeedRequestParameters(request);
      return Response.json(await createGatedFeedSummary(source, () => resolveAccess(request))(parameters, clock), { headers: privateMatchHeaders });
    } catch (error) { return publicMatchFailure(error, privateMatchHeaders); }
  };
}
