import { createMemberPreferencesHandler } from "@/server/members/member-preferences-http";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions } from "../../../fixture-admin";

const handler = createMemberPreferencesHandler(async () => ({ config: { production: false }, sessions: fixtureMemberSessions,
  settings: { settings: defaultSubscriptionSettings, source: "defaults" }, preferences: {
    async setWhatsAppNotifications(_member: unknown, enabled: boolean) { return { status: "saved", whatsappNotificationsAt: enabled ? new Date().toISOString() : null }; },
  },
}) as unknown as MemberServices);
export async function POST(request: Request) {
  const response = await handler(request);
  if (response.ok) {
    const result = await response.clone().json();
    response.headers.append("Set-Cookie", `member-fixture-whatsapp=${result.whatsappNotificationsAt ? "on" : "off"}; Path=/; SameSite=Lax`);
  }
  return response;
}
