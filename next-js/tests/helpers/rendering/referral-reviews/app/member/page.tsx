import { AccountWorkspace, AccountPageHead } from "@/components/members/account-workspace";
import { AccountReferralReviews } from "@/components/members/account-referral-reviews";
import { PublicShell } from "@/app/_components/public-shell";
import { memberCases } from "../fixture";

export default function MemberReviewFixture() {
  return <PublicShell locale="en" workspace showAccount><AccountWorkspace locale="en" current="referrals" phone="256700000001" returnTo={null}>
    <AccountPageHead><h1>Referrals</h1></AccountPageHead><AccountReferralReviews initial={memberCases()} />
  </AccountWorkspace></PublicShell>;
}
