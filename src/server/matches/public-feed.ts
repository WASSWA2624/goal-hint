import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import type { FeedParameters } from "../../domain/feed-query.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchFeedService } from "./feed-service.ts";

/** Pages and HTTP reads share the same stored projection, scope and cache. */
export function readPublicMatchFeed(parameters: FeedParameters, context: Readonly<{ locale?: string; routeDate?: string }> = {}, clock?: Clock) {
  const database = getDatabase();
  return createMatchFeedService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters, context);
}
