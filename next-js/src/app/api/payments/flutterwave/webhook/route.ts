import { createFlutterwaveHandlers } from "../../../../../server/members/flutterwave-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createFlutterwaveHandlers().POST;
