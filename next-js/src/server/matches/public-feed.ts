import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchFeedService } from "./feed-service.ts";
import { createMatchFeedSummaryService } from "./feed-summary-service.ts";

/** Pages and HTTP reads share the same stored projection, scope and cache. */
export function readPublicMatchFeed(parameters: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}, clock?: Clock) {
  return readStoredFeed(parameters, context, clock, true);
}

/** Match cards and their exact pagination do not wait for a historical audit. */
export function readPublicMatchFeedList(parameters: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}, clock?: Clock) {
  return readStoredFeed(parameters, context, clock, false);
}

/** Independently bounded aggregate request; list navigation keeps its 30s limit. */
export function readPublicMatchFeedSummary(parameters: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}, clock?: Clock) {
  const database = getDatabase();
  return createMatchFeedSummaryService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, context);
}

function readStoredFeed(parameters: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }>, clock: Clock | undefined, includePerformance: boolean) {
  const database = getDatabase();
  return createMatchFeedService({ database, cache: createMysqlPublicResponseCache(database), includePerformance, ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, context);
}
