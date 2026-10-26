import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createSettingsHandlers } from "../../../../server/admin/settings-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only, same-origin JSON actions; every change is audited, and protected fields also need the password again.
const settings = createSettingsHandlers();
export const GET = adminRoute(settings.GET);
export const POST = adminRoute(settings.POST);
