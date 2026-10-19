import { createMemberSignOutHandler } from "../../../../server/members/member-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createMemberSignOutHandler();
