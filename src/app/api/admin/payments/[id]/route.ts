import { adminRoute } from "../../../../../server/admin/admin-http.ts";
import { createReviewHandlers } from "../../../../../server/admin/codes-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adminRoute(createReviewHandlers().POST);
