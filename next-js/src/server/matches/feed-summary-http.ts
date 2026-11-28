import "server-only";

import { matchFeedRequestParameters } from "./feed-http.ts";
import { privateMatchHeaders, publicMatchFailure } from "./public-http.ts";
import { readPublicMatchFeedSummary } from "./public-feed.ts";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { createGatedFeedSummary, type FeedSummarySource } from "./feed-summary-read.ts";

async function summaryViewerAccess(request: Request) {
  // This endpoint uses only tier and sign-in state. Without a session cookie,
  // the settings lookup cannot change either value.
  return request.headers.has("cookie") ? viewerAccessFromRequest(request)
    : { tier: "free", signedIn: false, mode: "free" } as const;
}

/** Uses the feed's strict request parser and entitlement rules without building a full list response. */
export function createMatchFeedSummaryHandler(source: FeedSummarySource,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, resolveAccess = summaryViewerAccess) {
  return async (request: Request): Promise<Response> => {
    try {
      const { parameters } = matchFeedRequestParameters(request);
      return Response.json(await createGatedFeedSummary(source, () => resolveAccess(request))(parameters, clock), { headers: privateMatchHeaders });
    } catch (error) { return publicMatchFailure(error, privateMatchHeaders); }
  };
}

export const readMatchFeedSummary = createMatchFeedSummaryHandler(readPublicMatchFeedSummary);
