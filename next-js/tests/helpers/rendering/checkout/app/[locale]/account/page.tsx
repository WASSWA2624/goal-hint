import { AccountReferrals } from "@/components/members/account-referrals";
import { ButtonLink } from "@/components/ui/controls";

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  if ((await searchParams).section !== "referrals") return <main><h1>Account preview</h1>
    <ButtonLink href="/en/subscribe" prefetch={false}>Payment preview</ButtonLink>
  </main>;
  return <main><h1>Referral sharing preview</h1><p>Synthetic invitation. Share controls use the existing referral flow.</p>
    <AccountReferrals locale="en" summary={{ code: "a".repeat(32), verified: 0, earnedDays: 0, remainingMs: 0, availableDays: 0, history: [] }} />
  </main>;
}
