import { createMemberAuthHandler } from "../../../../server/members/member-auth-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createMemberAuthHandler("forgot");
