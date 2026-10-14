import { createReportHandler } from "../../../../server/analytics/analytics-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createReportHandler();
