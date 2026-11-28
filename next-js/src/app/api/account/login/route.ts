import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { createMemberAuthHandler } from "../../../../server/members/member-auth-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withRequestTiming("account-login", createMemberAuthHandler("login"));
