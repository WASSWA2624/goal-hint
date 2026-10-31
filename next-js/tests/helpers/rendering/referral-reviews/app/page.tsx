import { AdminShell } from "@/components/admin/admin-shell";
import { ReferralReviewsEditor } from "@/components/admin/referral-reviews-editor";
import { cases } from "./fixture";

export default function ReviewFixture() {
  return <AdminShell current="referrals" username="Synthetic reviewer"><ReferralReviewsEditor initial={cases()} /></AdminShell>;
}
