import { createMemberCodeHandler, type MemberServices } from "@/server/members/member-http";
export const POST = createMemberCodeHandler(async () => ({ config: { production: false, cookies: { secure: false } },
  settings: { settings: { paywallMode: "test", maxUnlockedDevices: 2 } }, sessions: { async verify() { return { blocked: false }; } },
  codes: { async redeem() { return { status: "accepted", token: "f".repeat(43) }; } },
}) as unknown as MemberServices);
