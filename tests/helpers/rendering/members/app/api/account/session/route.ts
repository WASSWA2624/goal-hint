import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import { fixtureSubscriptionServices, subscriptionScenarioFromHeaders } from "../../../fixture-subscription";

export const GET = (request: Request) => createMemberSessionHandler(async () => fixtureSubscriptionServices(subscriptionScenarioFromHeaders(request.headers)))(request);
