import { ownerSignInAudit } from "../../../../server/admin/audit.ts";
import { createLogoutHandler, getAnalyticsServices } from "../../../../server/analytics/analytics-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createLogoutHandler(getAnalyticsServices, { audit: ownerSignInAudit(getAnalyticsServices, "analytics") });
