import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createSubscriberHandlers } from "../../../../../server/admin/subscribers-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const subscribers = createSubscriberHandlers();
export const GET = adminRoute(subscribers.GET);
export const POST = adminRoute(subscribers.POST);
