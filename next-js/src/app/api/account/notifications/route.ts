import { createAccountNotificationsHandler } from "@/server/members/account-notifications-http";
export const GET = createAccountNotificationsHandler("read");
export const POST = createAccountNotificationsHandler("write");
