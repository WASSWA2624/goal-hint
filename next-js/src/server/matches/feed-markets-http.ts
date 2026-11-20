import "server-only";

import { parseFeedStatus } from "../../domain/feed-query.ts";
import type { FeedMarketPick } from "../../domain/feed-market-picks.ts";
import { contentAccess } from "../members/gated-reads.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { MatchFeedError } from "./feed-error.ts";
import { matchFeedRequestParameters } from "./feed-http.ts";
import { readPublishedFeedMarkets } from "./feed-markets-read.ts";
import { privateMatchHeaders, publicMatchFailure } from "./public-http.ts";

type FeedMarketsSource = (finishedOnly: boolean) => Promise<readonly FeedMarketPick[]>;

export function createMatchFeedMarketsHandler(source: FeedMarketsSource, resolveAccess = viewerAccessFromRequest) {
  return async (request: Request): Promise<Response> => {
    try {
      const { parameters, omitLeagues } = matchFeedRequestParameters(request);
      const statuses = parameters.getAll("status");
      if (omitLeagues || statuses.length > 1 || [...parameters.keys()].some((key) => key !== "status")) {
        throw new MatchFeedError("invalid-query");
      }
      let status;
      try { status = parseFeedStatus(statuses[0]); }
      catch { throw new MatchFeedError("invalid-query"); }

      const resolve = () => resolveAccess(request);
      const finishedOnly = (await contentAccess(resolve)).tier === "free";
      if (finishedOnly && status !== "finished") throw new MatchFeedError("subscription-required");

      const marketPicks = await source(finishedOnly);
      // An expired entitlement must never return the unrestricted catalog.
      if (!finishedOnly && (await contentAccess(resolve)).tier === "free") throw new MatchFeedError("subscription-required");
      return Response.json({ marketPicks }, { headers: privateMatchHeaders });
    } catch (error) {
      return publicMatchFailure(error, privateMatchHeaders);
    }
  };
}

export const readMatchFeedMarkets = createMatchFeedMarketsHandler(readPublishedFeedMarkets);
