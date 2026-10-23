import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions } from "../../../fixture-admin";

export const GET = createMemberSessionHandler(async () => ({ config: { production: false }, sessions: fixtureMemberSessions }) as unknown as MemberServices);
