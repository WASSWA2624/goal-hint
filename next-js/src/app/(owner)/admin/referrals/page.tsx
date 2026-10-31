import type { Metadata } from "next";
import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { readAdminReferralReviews } from "@/server/admin/referral-reviews-http";
import { ReferralReviewsEditor } from "@/components/admin/referral-reviews-editor";

export const metadata: Metadata = { title: "Referral review · Admin · Goal Hint" };
export default async function AdminReferralReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await adminPageGate(searchParams);
  if (!page.owner) redirectToAccountLogin();
  const cases = await readAdminReferralReviews(page.services).catch(() => null);
  return <ReferralReviewsEditor initial={cases} />;
}
