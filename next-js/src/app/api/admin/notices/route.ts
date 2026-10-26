import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createNoticeHandlers } from "../../../../server/admin/notices-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createNoticeHandlers().POST);
