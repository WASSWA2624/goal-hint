import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createUserHandlers } from "../../../../server/admin/users-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withRequestTiming("admin-users", adminRoute(createUserHandlers().POST));
