import { adminRoute } from "../../../../server/admin/admin-http.ts";
import { createReferralReviewHandlers } from "../../../../server/admin/referral-reviews-http.ts";

const handlers = createReferralReviewHandlers();
export const GET = adminRoute(handlers.GET);
export const POST = adminRoute(handlers.POST);
