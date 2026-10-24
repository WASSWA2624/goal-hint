import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import type { MemberServices } from "@/server/members/member-http";
import { createMemberSessions } from "@/server/members/member-sessions";
import { seed } from "../../../fixture";

const analytics = seed();
const services = {
  config: { production: false },
  sessions: createMemberSessions({ database: analytics.database!, config: analytics.config }),
  settings: { settings: defaultSubscriptionSettings, source: "stored" },
} as unknown as MemberServices;

/** The production private session response authenticates only the synthetic administrator. */
export const GET = createMemberSessionHandler(async () => services);
