import { createOwnerLoginHandler } from "../../../../server/admin/owner-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The legacy entry point redirects to the shared account login without accepting credentials.
export const POST = createOwnerLoginHandler();
