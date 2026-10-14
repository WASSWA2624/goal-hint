import { createCollectHandler, createCollectStatusHandler } from "../../../../server/analytics/analytics-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent-gated page views and interactions from the first-party tracker (docs/analytics.md).
export const POST = createCollectHandler();
export const GET = createCollectStatusHandler();
