import { ButtonLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { memberNextPath } from "@/domain/member-navigation";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import type { SubscriptionStatus } from "@/domain/subscription-summary";
import { createMessages } from "@/i18n/messages";
import { MemberPanel } from "./member-controls";

/** The same account summary remains visible for payment approvals, manual grants and renewals. */
export function SubscriptionSummaryCard({ locale, subscription, canSubscribe, returnTo, paymentReversed = false }: {
  locale: string; subscription: SubscriptionStatus | null; canSubscribe: boolean; returnTo: string | null; paymentReversed?: boolean;
}) {
  const messages = createMessages(locale);
  if (!subscription) return <MemberPanel data-subscription-summary="unavailable"><p role="status">{messages.text("account.subscriptionUnavailable")}</p></MemberPanel>;
  const { activeUntil, paymentPending } = subscription;
  const viewPayment = paymentPending || paymentReversed;
  const destination = memberNextPath("subscribe", returnTo);
  return <MemberPanel data-subscription-summary={activeUntil ? "active" : "inactive"}><Stack $gap="sm">
    <h2>{messages.text(activeUntil ? "account.activeSubscription" : "account.noActiveSubscription")}</h2>
    {activeUntil && <p>{messages.text("account.subscriptionExpires")}{" "}<time dateTime={activeUntil}>{formatSubscriptionExpiry(new Date(activeUntil))}</time></p>}
    {canSubscribe && <Inline><ButtonLink href={`${destination}#${viewPayment ? "report" : "plans"}`} prefetch={false}>
      {messages.text(viewPayment ? "account.viewPayment" : activeUntil ? "account.renew" : "account.subscribe")}
    </ButtonLink></Inline>}
  </Stack></MemberPanel>;
}
