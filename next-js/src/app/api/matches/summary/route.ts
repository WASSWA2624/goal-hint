import { after } from "next/server";
import { createMatchFeedSummaryHandler } from "../../../../server/matches/feed-summary-http.ts";
import { readPublicMatchFeedSummary } from "../../../../server/matches/public-feed.ts";
import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { withServerMeasurement } from "../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const readMatchFeedSummary = createMatchFeedSummaryHandler((query, context, clock) => readPublicMatchFeedSummary(query, context, clock, after));
export const GET = withServerMeasurement("feed", withRequestTiming("matches-summary", readMatchFeedSummary));
