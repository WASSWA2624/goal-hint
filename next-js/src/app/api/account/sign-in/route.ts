import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { createMemberSignInHandler } from "../../../../server/members/member-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withRequestTiming("account-login", createMemberSignInHandler());
