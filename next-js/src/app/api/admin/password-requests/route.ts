import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createAdminPasswordRequestHandlers } from "../../../../server/admin/password-requests-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createAdminPasswordRequestHandlers();
export const GET = adminRoute(handlers.GET);
export const POST = adminRoute(handlers.POST);
