import { createMemberSessionHandler } from "@/server/members/member-auth-http";
import { fixtureScenarioFromHeaders, fixtureServices } from "../../../fixture";

export const GET = (request: Request) => createMemberSessionHandler(async () => fixtureServices(fixtureScenarioFromHeaders(request.headers)))(request);
