import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createPlansHandlers } from "../../../../server/admin/plans-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Administrator-only, same-origin JSON actions; every change is audited and referenced plans remain protected.
const plans = createPlansHandlers();
export const GET = adminRoute(plans.GET);
export const POST = adminRoute(plans.POST);
