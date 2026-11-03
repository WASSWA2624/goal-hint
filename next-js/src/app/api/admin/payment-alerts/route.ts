import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createPaymentAlertHandlers } from "../../../../server/admin/payment-alerts-http.ts";

const handlers = createPaymentAlertHandlers();
export const GET = adminRoute(handlers.GET);
export const POST = adminRoute(handlers.POST);
