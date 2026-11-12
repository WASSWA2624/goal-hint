import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import { fixtureSubscriptionServices, subscriptionScenarioFromHeaders } from "../../../fixture-subscription";

export const GET = (request: Request) => createMemberSessionHandler(async () => {
  const services = fixtureSubscriptionServices(subscriptionScenarioFromHeaders(request.headers));
  const { sessions } = services;
  if (!sessions) return services;
  return { ...services, sessions: { ...sessions, async verify(token) {
    const member = await sessions.verify(token);
    return member && !member.blocked && !member.administrator ? { ...member, referralCode: "a".repeat(32) } : member;
  } } };
})(request);
