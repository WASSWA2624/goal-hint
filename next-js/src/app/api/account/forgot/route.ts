import { createPasswordRecoveryHandler } from "../../../../server/members/member-auth-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPasswordRecoveryHandler("request");
