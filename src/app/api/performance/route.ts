import { createPerformanceHandler } from "../../../server/performance/performance-http.ts";
import { readPublicPerformance } from "../../../server/performance/public-performance.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OP-16/17 have no verified operating policy. Counts remain public; numeric claims stay gated.
export const GET = createPerformanceHandler(readPublicPerformance);
