import { readMatchFeedSummary } from "../../../../server/matches/feed-summary-http.ts";
import { withServerMeasurement } from "../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withServerMeasurement("feed", readMatchFeedSummary);
