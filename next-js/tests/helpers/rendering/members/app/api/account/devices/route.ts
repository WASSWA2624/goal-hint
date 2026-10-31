import { createMemberDevicesHandler, type MemberServices } from "@/server/members/member-http";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { fixtureMemberSessions } from "../../../fixture-admin";

export const POST = createMemberDevicesHandler(async () => ({ config: { production: false },
  settings: { settings: defaultSubscriptionSettings, source: "defaults" }, sessions: { ...fixtureMemberSessions,
    async verify(token: string) { const member = await fixtureMemberSessions.verify(token); return member ? { ...member, codeEnteredAt: new Date() } : null; },
    async signOutOthers() { return true; },
  },
}) as unknown as MemberServices);
