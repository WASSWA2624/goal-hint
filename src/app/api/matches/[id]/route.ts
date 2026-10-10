import { createMatchDetailHandler } from "../../../../server/matches/detail-http.ts";
import { readPublicMatchDetail } from "../../../../server/matches/public-detail.ts";
import { withServerMeasurement } from "../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withServerMeasurement("detail", createMatchDetailHandler(readPublicMatchDetail));
