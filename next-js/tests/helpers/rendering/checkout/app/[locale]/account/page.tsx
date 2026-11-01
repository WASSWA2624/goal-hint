import { AccountReferrals } from "@/components/members/account-referrals";
import { ButtonLink } from "@/components/ui/controls";

export default function Page() {
  return <main><h1>Referral sharing preview</h1><p>Synthetic invitation. Share controls use the existing referral flow.</p>
    <ButtonLink href="/" prefetch={false}>Back to payment preview</ButtonLink>
    <AccountReferrals locale="en" summary={{ code: "a".repeat(32), verified: 0, earnedDays: 0, remainingMs: 0, availableDays: 0, history: [] }} />
  </main>;
}
