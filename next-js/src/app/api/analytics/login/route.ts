import { createLoginHandler } from "../../../../server/analytics/analytics-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy clients must use the same account login as every other user.
export const POST = createLoginHandler();
