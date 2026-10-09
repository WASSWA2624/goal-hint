import { getDatabase } from "../../../server/database/client.ts";
import { getRuntimePolicy } from "../../../server/config/runtime-policy.ts";
import { createMatchFeedService } from "../../../server/matches/feed-service.ts";
import { createMatchFeedHandler } from "../../../server/matches/feed-http.ts";
import { createMysqlPublicResponseCache } from "../../../server/cache/mysql-public-cache.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchFeedHandler((parameters) => {
  const database = getDatabase();
  return createMatchFeedService({ database, cache: createMysqlPublicResponseCache(database),
    competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters);
});
