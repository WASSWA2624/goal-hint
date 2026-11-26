import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createSubscriberBulkHandler } from "../../../../../server/admin/subscribers-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createSubscriberBulkHandler());
