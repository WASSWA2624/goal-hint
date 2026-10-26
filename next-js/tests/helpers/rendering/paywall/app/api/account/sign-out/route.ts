import { createMemberSignOutHandler, type MemberServices } from "@/server/members/member-http";

export const POST = createMemberSignOutHandler(async () => ({ config: { production: false, cookies: { secure: false } },
  settings: { settings: { paywallMode: "test" } }, sessions: { async verify() { return { blocked: false }; }, async signOut() {} },
}) as unknown as MemberServices);
