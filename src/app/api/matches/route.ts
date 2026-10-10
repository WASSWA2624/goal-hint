import { createMatchFeedHandler } from "../../../server/matches/feed-http.ts";
import { readPublicMatchFeed } from "../../../server/matches/public-feed.ts";
import { withServerMeasurement } from "../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withServerMeasurement("feed", createMatchFeedHandler(readPublicMatchFeed));
