import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { getDatabase } from "../database/client.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchInsightsService } from "./insights-service.ts";
import { resultStatus } from "../results/result-read.ts";

export async function readPublicMatchStatus(id: string) {
  const row = await getDatabase().query((tx) => tx.footballFixture.findUnique({ where: { id }, select: { status: true } }));
  return resultStatus.parse(row?.status);
}

/** The match page and the section endpoint share stored reads, permission checks and cache. */
export function readPublicMatchInsights(id: string, clock?: Clock) {
  const database = getDatabase();
  return createMatchInsightsService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}) }).query(id);
}
