import { createOwnerLoginHandler } from "../../../../server/admin/owner-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The one /api/admin route without the admin guard: authenticates configured phones or owner usernames and lands on /admin.
export const POST = createOwnerLoginHandler();
