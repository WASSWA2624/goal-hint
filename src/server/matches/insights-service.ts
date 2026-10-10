import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { matchInsightsSchema, type MatchInsights } from "../../domain/match-insights.ts";
import { matchSections, type MatchSection } from "../../domain/match-view.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { MatchFeedError } from "./feed-error.ts";
import { storedMatchInsights } from "./insights-read.ts";
import { publicMatchFailure, publicMatchHeaders } from "./public-http.ts";

/** One bounded stored read per fixture, shared by the page previews and lazily opened sections. */
export function createMatchInsightsService(options: Readonly<{ database: DatabaseRuntime; clock?: Clock; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const evidenceStore = createMysqlEvidenceStore(options.database);
  return Object.freeze({ async query(id: string): Promise<MatchInsights> {
    if (!z.uuid().safeParse(id).success) throw new MatchFeedError("invalid-query");
    const asOf = clock.now();
    try {
      const read = () => options.database.transaction(async (tx) => freezeEvidence(await storedMatchInsights(tx, id.toLowerCase(), asOf, evidenceStore)),
        { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      // The detail read family keeps the existing catalog and fixture invalidation tags.
      return options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "detail", locale: "en", now: asOf, fixtureId: id.toLowerCase(),
        query: { view: "match-insights-v1", id: id.toLowerCase() }, parse: (value) => matchInsightsSchema.parse(value) }), read) : await read();
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}

/** GET /api/matches/{id}/insights?section=… returns one complete section. */
export function createMatchInsightsHandler(read: (id: string) => Promise<MatchInsights>) {
  return async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = await context.params, url = new URL(request.url), section = url.searchParams.get("section");
      if ([...url.searchParams.keys()].some((key) => key !== "section") || !(matchSections as readonly string[]).includes(section ?? "")) {
        throw new MatchFeedError("invalid-query");
      }
      const insights = await read(id), name = section as MatchSection;
      return Response.json({ fixtureId: insights.fixtureId, asOf: insights.asOf, section: name, data: insights.sections[name] }, { headers: publicMatchHeaders });
    } catch (error) { return publicMatchFailure(error); }
  };
}
