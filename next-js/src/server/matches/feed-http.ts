import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { maximumFeedWindowBytes } from "../../domain/match-feed-rules.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { MatchFeedError } from "./feed-error.ts";
import { publicMatchFailure, privateMatchHeaders } from "./public-http.ts";
import { readPublicMatchFeed, readPublicMatchFeedWindow } from "./public-feed.ts";
import { createGatedReads } from "../members/gated-reads.ts";
import { viewerContentAccessFromRequest } from "../members/viewer-access.ts";

/** Response options are validated and stripped before either feed projection parses its filters. */
export function matchFeedRequestParameters(request: Request, allowWindow = false) {
  const url = new URL(request.url), options = url.searchParams.getAll("leagues"), windows = url.searchParams.getAll("through");
  const prefixes = url.searchParams.getAll("prefix"), prefix = prefixes[0]?.match(/^([1-9]\d{0,4}):([a-f0-9]{64})$/u);
  if (options.length > 1 || options.length === 1 && options[0] !== "0") throw new MatchFeedError("invalid-query");
  if (windows.length && (!allowWindow || windows.length !== 1 || !/^[1-9]\d{0,4}$/u.test(windows[0]!) ||
    Number(windows[0]) > feedQueryRules.maximumPage)) throw new MatchFeedError("invalid-query");
  if (prefixes.length && (!allowWindow || windows.length || prefixes.length !== 1 || !prefix ||
    Number(prefix[1]) > feedQueryRules.maximumPage)) throw new MatchFeedError("invalid-query");
  const optionBytes = options.length * "&leagues=0".length + (windows.length ? `&through=${windows[0]}`.length : 0)
    + (prefix ? `&prefix=${prefix[1]}%3A${prefix[2]}`.length : 0);
  if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes + optionBytes) throw new MatchFeedError("invalid-query");
  url.searchParams.delete("leagues");
  url.searchParams.delete("through");
  url.searchParams.delete("prefix");
  return { parameters: url.searchParams, omitLeagues: options.length > 0, through: windows.length ? Number(windows[0]) : null,
    prefix: prefix ? { firstPage: Number(prefix[1]), hash: prefix[2]! } : null };
}

function boundedFeedPage(page: unknown): string {
  const body = JSON.stringify(page);
  if (Buffer.byteLength(body, "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
  return body;
}

export function createMatchFeedHandler(read: typeof readPublicMatchFeed,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, resolveAccess = viewerContentAccessFromRequest,
  readWindow = readPublicMatchFeedWindow) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const asOf = clock.now(), { parameters, omitLeagues, through, prefix } = matchFeedRequestParameters(request, true);
      const gated = createGatedReads({ readFeed: read, readWindow, resolveAccess: () => resolveAccess(request) });
      const observed = { now: () => asOf };
      if (through !== null) {
        const pages = await gated.feedWindow(parameters, through, {}, observed);
        const body = `{"pages":[${pages.map(page => boundedFeedPage(omitLeagues ? { ...page, leagues: [] } : page)).join(",")}]}`;
        if (Buffer.byteLength(body, "utf8") > maximumFeedWindowBytes) throw new MatchFeedError("unavailable");
        return new Response(body, { headers: { ...privateMatchHeaders, "content-type": "application/json" } });
      }
      // `leagues=0` drops the filter options from polls and counts. It is a response option,
      // not a feed filter: it is not charged to the query limit and leaves before the strict parser.
      const result = await gated.feed(parameters, prefix ? { continuation: prefix } : {}, observed);
      if (prefix) return new Response(boundedFeedPage({ page: omitLeagues ? { ...result, leagues: [] } : result, prefix: prefix.hash }),
        { headers: { ...privateMatchHeaders, "content-type": "application/json" } });
      const links = [result.links.next ? `<${result.links.next}>; rel="next"` : null, result.links.previous ? `<${result.links.previous}>; rel="prev"` : null].filter(Boolean).join(", ");
      return Response.json(omitLeagues ? { ...result, leagues: [] } : result,
        { headers: { ...privateMatchHeaders, ...(links ? { link: links } : {}) } });
    } catch (error) {
      return publicMatchFailure(error, privateMatchHeaders);
    }
  };
}
