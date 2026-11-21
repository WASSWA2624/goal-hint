import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import { services } from "../../../fixture";

export const dynamic = "force-dynamic";
export const GET = createMemberSessionHandler(services);
