import { createMemberReferralReviewHandler } from "../../../../server/members/referral-reviews-http.ts";

export const GET = createMemberReferralReviewHandler("read");
export const POST = createMemberReferralReviewHandler("appeal");
