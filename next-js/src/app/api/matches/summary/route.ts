import { readMatchFeedSummary } from "../../../../server/matches/feed-summary-http.ts";
import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { withServerMeasurement } from "../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withServerMeasurement("feed", withRequestTiming("matches-summary", readMatchFeedSummary));
