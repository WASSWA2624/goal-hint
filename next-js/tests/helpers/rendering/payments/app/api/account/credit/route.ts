import { createCreditHandler } from "@/server/members/credit-http";
import { fixtureScenarioFromHeaders, fixtureServices } from "../../../fixture";
export const POST = (request: Request) => createCreditHandler(async () => fixtureServices(fixtureScenarioFromHeaders(request.headers)))(request);
