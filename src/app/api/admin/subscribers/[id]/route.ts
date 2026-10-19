import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createSubscriberHandlers } from "../../../../../server/admin/subscribers-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createSubscriberHandlers().POST);
