import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { getDatabase } from "../database/client.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { createMatchDetailService } from "./detail-service.ts";

/** API and Server Components share stored reads, permission checks and cache. */
export function readPublicMatchDetail(id: string, parameters = new URLSearchParams(), clock?: Clock) {
  const database = getDatabase();
  return createMatchDetailService({ database, cache: createMysqlPublicResponseCache(database), ...(clock ? { clock } : {}) }).query(id, parameters);
}
