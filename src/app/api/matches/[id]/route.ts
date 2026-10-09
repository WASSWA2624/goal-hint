import { getDatabase } from "../../../../server/database/client.ts";
import { createMatchDetailService } from "../../../../server/matches/detail-service.ts";
import { createMatchDetailHandler } from "../../../../server/matches/detail-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchDetailHandler((id, parameters) => createMatchDetailService({ database: getDatabase() }).query(id, parameters));
