import { createFlutterwaveWebhookHandler } from "@/server/members/flutterwave-http";

export const runtime = "nodejs";
export const POST = createFlutterwaveWebhookHandler();
