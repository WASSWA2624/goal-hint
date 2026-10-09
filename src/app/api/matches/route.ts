import { getDatabase } from "../../../server/database/client.ts";
import { getRuntimePolicy } from "../../../server/config/runtime-policy.ts";
import { createMatchFeedService } from "../../../server/matches/feed-service.ts";
import { createMatchFeedHandler } from "../../../server/matches/feed-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchFeedHandler((parameters) => createMatchFeedService({ database: getDatabase(),
  competitionIds: getRuntimePolicy().choices.competitionIds ?? [] }).query(parameters));
