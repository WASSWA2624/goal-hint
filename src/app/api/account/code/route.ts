import { createMemberCodeHandler } from "@/server/members/member-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createMemberCodeHandler();
