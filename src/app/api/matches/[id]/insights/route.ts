import { createMatchInsightsHandler } from "../../../../../server/matches/insights-service.ts";
import { readPublicMatchInsights } from "../../../../../server/matches/public-insights.ts";
import { withServerMeasurement } from "../../../../../server/monitoring/server-measurements.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withServerMeasurement("detail", createMatchInsightsHandler(readPublicMatchInsights));
