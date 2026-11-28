import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createUserBulkHandler } from "../../../../../server/admin/users-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createUserBulkHandler());
