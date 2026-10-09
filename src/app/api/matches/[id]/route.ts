import { createMatchDetailHandler } from "../../../../server/matches/detail-http.ts";
import { readPublicMatchDetail } from "../../../../server/matches/public-detail.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchDetailHandler(readPublicMatchDetail);
