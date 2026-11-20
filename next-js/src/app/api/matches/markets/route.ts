import { readMatchFeedMarkets } from "../../../../server/matches/feed-markets-http.ts";
import { withServerMeasurement } from "../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withServerMeasurement("feed", readMatchFeedMarkets);
