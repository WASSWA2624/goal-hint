import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchFeedRules, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchFeedQuery } from "./feed-service.ts";
import { publicMatchFailure, publicMatchHeaders } from "./public-http.ts";

export function createMatchFeedHandler(read: (parameters: URLSearchParams) => Promise<MatchFeedResponse>) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      // `leagues=0` drops the filter options from polls and counts. It is a response option,
      // not a feed filter: it is not charged to the query limit and leaves before the strict parser.
      const options = url.searchParams.getAll("leagues");
      if (options.length > 1 || options.length === 1 && options[0] !== "0") throw new MatchFeedError("invalid-query");
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes + options.length * "&leagues=0".length) throw new MatchFeedError("invalid-query");
      url.searchParams.delete("leagues");
      parseMatchFeedQuery(url.searchParams, getReportingDate(utcInstantFromEpochMilliseconds(Date.now())));
      const result = await read(url.searchParams);
      const links = [result.links.next ? `<${result.links.next}>; rel="next"` : null, result.links.previous ? `<${result.links.previous}>; rel="prev"` : null].filter(Boolean).join(", ");
      return Response.json(options.length > 0 ? { ...result, leagues: [] } : result,
        { headers: { ...publicMatchHeaders, ...(links ? { link: links } : {}) } });
    } catch (error) {
      return publicMatchFailure(error);
    }
  };
}
