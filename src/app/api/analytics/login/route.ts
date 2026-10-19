import { ownerSignInAudit } from "../../../../server/admin/audit.ts";
import { createLoginHandler, getAnalyticsServices } from "../../../../server/analytics/analytics-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The analytics dashboard shares the owner login, so its sign-ins are owner sign-ins too and are audited the same way.
export const POST = createLoginHandler(getAnalyticsServices, { audit: ownerSignInAudit(getAnalyticsServices, "analytics") });
