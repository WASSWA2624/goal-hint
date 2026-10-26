import { createMemberAuthHandler } from "@/server/members/member-auth-http";
import { source } from "../../../offline-identity";

export const POST = createMemberAuthHandler("login", source);
