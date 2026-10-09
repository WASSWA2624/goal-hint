import { getDatabase } from "../../../../server/database/client.ts";
import { createMatchDetailService } from "../../../../server/matches/detail-service.ts";
import { createMatchDetailHandler } from "../../../../server/matches/detail-http.ts";
import { createMysqlPublicResponseCache } from "../../../../server/cache/mysql-public-cache.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchDetailHandler((id, parameters) => {
  const database = getDatabase();
  return createMatchDetailService({ database, cache: createMysqlPublicResponseCache(database) }).query(id, parameters);
});
