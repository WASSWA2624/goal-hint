import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createCodesHandlers } from "../../../../server/admin/codes-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = adminRoute(createCodesHandlers().GET);
export const POST = adminRoute(createCodesHandlers().POST);
