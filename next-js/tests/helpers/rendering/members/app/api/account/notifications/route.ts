import { createAccountNotificationsHandler } from "@/server/members/account-notifications-http";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import type { MemberServices } from "@/server/members/member-http";
import { fixtureMemberSessions } from "../../../fixture-admin";
import { fixtureNotifications } from "../../../fixture-notifications";

const services = async () => ({ config: { production: false }, sessions: fixtureMemberSessions,
  settings: { settings: defaultSubscriptionSettings, source: "defaults" }, notifications: fixtureNotifications(),
}) as unknown as MemberServices;
export const GET = createAccountNotificationsHandler("read", services);
export const POST = createAccountNotificationsHandler("write", services);
