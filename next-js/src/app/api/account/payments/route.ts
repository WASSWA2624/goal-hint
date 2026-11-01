import { createCheckoutHandlers } from "@/server/members/checkout-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Compatibility URL shares the same authorised, durable workflow.
export const POST = createCheckoutHandlers().POST;
