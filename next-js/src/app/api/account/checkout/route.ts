import { createCheckoutHandlers } from "../../../../server/members/checkout-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createCheckoutHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
