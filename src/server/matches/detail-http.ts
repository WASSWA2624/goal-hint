import "server-only";

import type { MatchDetailResponse } from "../../domain/match-detail.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";
import { parseMatchDetailQuery } from "./detail-query.ts";
import { publicMatchFailure, publicMatchHeaders } from "./public-http.ts";

export function createMatchDetailHandler(read: (id: string, parameters: URLSearchParams) => Promise<MatchDetailResponse>) {
  return async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = await context.params, url = new URL(request.url);
      if (Buffer.byteLength(url.search, "utf8") > matchFeedRules.maximumQueryBytes) throw new MatchFeedError("invalid-query");
      parseMatchDetailQuery(id, url.searchParams);
      const result = await read(id, url.searchParams);
      const next = result.history.revisions.next;
      return Response.json(result, { headers: { ...publicMatchHeaders, ...(next ? { link: `<${next}>; rel="next"` } : {}) } });
    } catch (error) { return publicMatchFailure(error); }
  };
}
