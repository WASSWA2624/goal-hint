import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { getDatabase } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createPerformanceService } from "./performance-service.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";

/** Production stays counts-only until OP-16/17 approval; isolated demo uses synthetic diagnostics. */
export async function readPublicPerformance(parameters: URLSearchParams, clock?: Clock) {
  const database = getDatabase();
  const demo = isDevelopmentDemo() ? await import("../demo/performance.ts") : null;
  const policy = demo?.demoPerformancePolicy() ?? null, quoteBinding = demo?.demoPerformanceQuotes() ?? null;
  return createPerformanceService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}),
    policy, quoteBinding, competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters);
}
