import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createOwnerLogoutHandler } from "../../../../server/admin/owner-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cross-site posts are refused like every admin route, but no session check runs: a lapsed session or a storage error
// must never leave the owner cookie behind a reply that says the session ended.
const logout = createOwnerLogoutHandler();
export const POST = adminRoute(({ request }) => logout(request), { session: "optional" });
