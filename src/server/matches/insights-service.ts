import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { storedMatchInsightsSchema, type StoredMatchInsights } from "../../domain/match-insights.ts";
import { matchSections, type MatchSection } from "../../domain/match-view.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { MatchFeedError } from "./feed-error.ts";
import { storedMatchInsights } from "./insights-read.ts";
import { publicMatchFailure, privateMatchHeaders } from "./public-http.ts";
import { createGatedReads } from "../members/gated-reads.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";

/**
 * Reads in flight per database and fixture. Services are created per request, so concurrent section
 * requests (one section can open three) share one snapshot build here; entries leave on settle.
 */
const inflight = new WeakMap<DatabaseRuntime, Map<string, Promise<StoredMatchInsights>>>();

/** One bounded stored read per fixture, shared by the page previews and lazily opened sections. */
export function createMatchInsightsService(options: Readonly<{ database: DatabaseRuntime; clock?: Clock; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const evidenceStore = createMysqlEvidenceStore(options.database);
  async function load(id: string): Promise<StoredMatchInsights> {
    const asOf = clock.now();
    try {
      const read = () => options.database.transaction(async (tx) => freezeEvidence(await storedMatchInsights(tx, id, asOf, evidenceStore)),
        { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      // The detail read family keeps the existing catalog and fixture invalidation tags.
      return options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "detail", locale: "en", now: asOf, fixtureId: id,
        query: { view: "match-insights-v1", id }, parse: (value) => storedMatchInsightsSchema.parse(value) }), read) : await read();
    } catch (error) {
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  }
  return Object.freeze({ async query(id: string): Promise<StoredMatchInsights> {
    if (!z.uuid().safeParse(id).success) throw new MatchFeedError("invalid-query");
    const key = id.toLowerCase(), pending = inflight.get(options.database) ?? new Map<string, Promise<StoredMatchInsights>>();
    inflight.set(options.database, pending);
    const shared = pending.get(key);
    if (shared) return shared;
    const promise = load(key).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  } });
}

/** GET /api/matches/{id}/insights?section=… returns one complete section. */
export function createMatchInsightsHandler(read: (id: string) => Promise<StoredMatchInsights>, {
  resolveAccess = viewerAccessFromRequest, readStatus,
}: { resolveAccess?: typeof viewerAccessFromRequest; readStatus?: (id: string) => Promise<SettlementStatus> } = {}) {
  return async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = await context.params, url = new URL(request.url), section = url.searchParams.get("section");
      if ([...url.searchParams.keys()].some((key) => key !== "section") || !(matchSections as readonly string[]).includes(section ?? "")) {
        throw new MatchFeedError("invalid-query");
      }
      const insights = await createGatedReads({ readInsights: read, resolveAccess: () => resolveAccess(request), ...(readStatus ? { readStatus } : {}) }).insights(id), name = section as MatchSection;
      return Response.json({ fixtureId: insights.fixtureId, asOf: insights.asOf, section: name, data: insights.sections[name], access: insights.access }, { headers: privateMatchHeaders });
    } catch (error) { return publicMatchFailure(error, privateMatchHeaders); }
  };
}
