import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { matchFeedRules, type MatchFeedResponse } from "../../domain/match-feed.ts";
import { maximumFeedWindowBytes } from "../../domain/match-feed-rules.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { MatchFeedError } from "./feed-error.ts";
import { publicMatchFailure, privateMatchHeaders } from "./public-http.ts";
import { readPublicMatchFeed, readPublicMatchFeedContinuation, readPublicMatchFeedWindow } from "./public-feed.ts";
import { createGatedReads } from "../members/gated-reads.ts";
import { viewerContentAccessFromRequest } from "../members/viewer-access.ts";

/** Response options are validated and stripped before either feed projection parses its filters. */
export function matchFeedRequestParameters(request: Request, allowWindow = false) {
  const url = new URL(request.url), options = url.searchParams.getAll("leagues"), windows = url.searchParams.getAll("through");
  const prefixes = url.searchParams.getAll("prefix"), prefix = prefixes[0]?.match(/^([1-9]\d{0,4}):([a-f0-9]{64})$/u);
  const rebase = url.searchParams.getAll("rebase");
  if (options.length > 1 || options.length === 1 && options[0] !== "0") throw new MatchFeedError("invalid-query");
  if (windows.length && (!allowWindow || windows.length !== 1 || !/^[1-9]\d{0,4}$/u.test(windows[0]!) ||
    Number(windows[0]) > feedQueryRules.maximumPage)) throw new MatchFeedError("invalid-query");
  if (prefixes.length && (!allowWindow || windows.length || prefixes.length !== 1 || !prefix ||
    Number(prefix[1]) > feedQueryRules.maximumPage)) throw new MatchFeedError("invalid-query");
  if (rebase.length && (!prefix || rebase.length !== 1 || rebase[0] !== "1")) throw new MatchFeedError("invalid-query");
  const optionBytes = options.length * "&leagues=0".length + (windows.length ? `&through=${windows[0]}`.length : 0)
    + (prefix ? `&prefix=${prefix[1]}%3A${prefix[2]}`.length : 0) + rebase.length * "&rebase=1".length;
  if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes + optionBytes) throw new MatchFeedError("invalid-query");
  url.searchParams.delete("leagues");
  url.searchParams.delete("through");
  url.searchParams.delete("prefix");
  url.searchParams.delete("rebase");
  return { parameters: url.searchParams, omitLeagues: options.length > 0, through: windows.length ? Number(windows[0]) : null,
    prefix: prefix ? { firstPage: Number(prefix[1]), hash: prefix[2]! } : null, rebase: rebase.length > 0 };
}

function boundedFeedPage(page: unknown): string {
  const body = JSON.stringify(page);
  if (Buffer.byteLength(body, "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
  return body;
}

function boundedFeedWindow(pages: readonly MatchFeedResponse[], prefix?: string): string {
  const body = `{"pages":[${pages.map(boundedFeedPage).join(",")}]${prefix ? `,"prefix":${JSON.stringify(prefix)}` : ""}}`;
  if (Buffer.byteLength(body, "utf8") > maximumFeedWindowBytes) throw new MatchFeedError("unavailable");
  return body;
}

function feedJson(body: string) {
  return new Response(body, { headers: { ...privateMatchHeaders, "content-type": "application/json" } });
}

export function createMatchFeedHandler(read: typeof readPublicMatchFeed,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }, resolveAccess = viewerContentAccessFromRequest,
  readWindow = readPublicMatchFeedWindow, readContinuation = readPublicMatchFeedContinuation) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const asOf = clock.now(), { parameters, omitLeagues, through, prefix, rebase } = matchFeedRequestParameters(request, true);
      const gated = createGatedReads({ readFeed: read, readWindow, readContinuation, resolveAccess: () => resolveAccess(request) });
      const observed = { now: () => asOf };
      // The browser can keep its existing filter options during polls and appends.
      const present = (page: MatchFeedResponse) => omitLeagues ? { ...page, leagues: [] } : page;
      if (through !== null) {
        const pages = await gated.feedWindow(parameters, through, {}, observed);
        return feedJson(boundedFeedWindow(pages.map(present)));
      }
      if (prefix) {
        const result = rebase ? await gated.feedContinuation(parameters, prefix, {}, observed)
          : { page: await gated.feed(parameters, { continuation: prefix }, observed) };
        return feedJson("pages" in result ? boundedFeedWindow(result.pages.map(present), prefix.hash)
          : boundedFeedPage({ page: present(result.page), prefix: prefix.hash }));
      }
      const result = await gated.feed(parameters, {}, observed);
      const links = [result.links.next ? `<${result.links.next}>; rel="next"` : null, result.links.previous ? `<${result.links.previous}>; rel="prev"` : null].filter(Boolean).join(", ");
      return Response.json(present(result),
        { headers: { ...privateMatchHeaders, ...(links ? { link: links } : {}) } });
    } catch (error) {
      return publicMatchFailure(error, privateMatchHeaders);
    }
  };
}
