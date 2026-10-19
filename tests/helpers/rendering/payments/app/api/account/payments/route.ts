import { createPaymentHandler } from "@/server/members/payment-http";
import { fixtureServices } from "../../../fixture";
export const POST = createPaymentHandler(async () => fixtureServices());
