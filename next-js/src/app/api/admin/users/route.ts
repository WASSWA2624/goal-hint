import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createUserHandlers } from "../../../../server/admin/users-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createUserHandlers().POST);
