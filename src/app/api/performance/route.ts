import { getDatabase } from "../../../server/database/client.ts";
import { getRuntimePolicy } from "../../../server/config/runtime-policy.ts";
import { createPerformanceHandler } from "../../../server/performance/performance-http.ts";
import { createPerformanceService } from "../../../server/performance/performance-service.ts";
import { createMysqlPublicResponseCache } from "../../../server/cache/mysql-public-cache.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OP-16/17 have no verified operating policy. Counts remain public; numeric claims stay gated.
export const GET = createPerformanceHandler((parameters) => {
  const database = getDatabase();
  return createPerformanceService({ database, cache: createMysqlPublicResponseCache(database),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters);
});
