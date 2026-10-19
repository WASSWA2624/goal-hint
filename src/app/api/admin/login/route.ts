import { createOwnerLoginHandler } from "../../../../server/admin/owner-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The one /api/admin route without the admin guard: it creates the owner session (same-origin, throttled, lands on /admin).
export const POST = createOwnerLoginHandler();
