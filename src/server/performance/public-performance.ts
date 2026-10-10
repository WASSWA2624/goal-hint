import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createPerformanceService } from "./performance-service.ts";

/** Pages and HTTP share scope, cache and counts-only policy until OP-16/17 are approved. */
export function readPublicPerformance(parameters: URLSearchParams, clock?: Clock) {
  const database = getDatabase();
  return createPerformanceService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters);
}
