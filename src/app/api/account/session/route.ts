import { createMemberSessionHandler } from "../../../../server/members/member-auth-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createMemberSessionHandler();
