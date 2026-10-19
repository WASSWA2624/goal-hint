import { createMemberSignInHandler, type MemberServices } from "@/server/members/member-http";
export const POST = createMemberSignInHandler(async () => ({ config: { production: false, cookies: { secure: false } },
  settings: { settings: { paywallMode: "test", maxUnlockedDevices: 2 } }, sessions: {},
  codes: { async signInWithCode() { return { status: "accepted", token: "f".repeat(43) }; } },
}) as unknown as MemberServices);
