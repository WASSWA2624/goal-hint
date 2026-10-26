import { createTrialHandler } from "@/server/members/payment-http";
import { fixtureServices } from "../../../fixture";
export const POST = createTrialHandler(async () => fixtureServices());
