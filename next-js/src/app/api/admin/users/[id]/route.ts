import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createUserHandlers } from "../../../../../server/admin/users-http.ts";
import { withRequestTiming } from "../../../../../server/http/request-timing.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const users = createUserHandlers();
export const GET = withRequestTiming("admin-user-detail", adminRoute(users.GET));
export const POST = adminRoute(users.POST);
