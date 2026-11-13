import "server-only";

import { readPublicMatchDetail } from "./public-detail.ts";
import { createGatedReads } from "../members/gated-reads.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchDetailQuery } from "./detail-query.ts";
import { acceptsResultFreshness, privateResultFreshnessHeaders, publicMatchFailure, withoutResultFreshness } from "./public-http.ts";

export function createMatchDetailHandler(read: typeof readPublicMatchDetail, resolveAccess = viewerAccessFromRequest) {
  return async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = await context.params, url = new URL(request.url);
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes) throw new MatchFeedError("invalid-query");
      parseMatchDetailQuery(id, url.searchParams);
      const result = await createGatedReads({ readDetail: read, resolveAccess: () => resolveAccess(request) }).detail(id, url.searchParams);
      const next = "gated" in result.history ? null : result.history.revisions.next;
      const fixture = acceptsResultFreshness(request) ? result.fixture : withoutResultFreshness(result.fixture);
      return Response.json({ ...result, fixture }, { headers: { ...privateResultFreshnessHeaders, ...(next ? { link: `<${next}>; rel="next"` } : {}) } });
    } catch (error) { return publicMatchFailure(error, privateResultFreshnessHeaders); }
  };
}
