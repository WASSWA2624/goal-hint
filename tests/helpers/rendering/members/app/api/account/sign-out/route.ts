import { createMemberSignOutHandler } from "@/server/members/member-http";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureAdminServices, fixtureMemberSessions } from "../../../fixture-admin";

export const POST = createMemberSignOutHandler(async () => ({ config: (await fixtureAdminServices()).config,
  sessions: fixtureMemberSessions }) as unknown as MemberServices, fixtureAdminServices);
