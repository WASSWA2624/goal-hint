import { createPaymentHandler } from "@/server/members/payment-http";
import { fixtureScenarioFromHeaders, fixtureServices } from "../../../fixture";
export const POST = (request: Request) => createPaymentHandler(async () => fixtureServices(fixtureScenarioFromHeaders(request.headers)))(request);
