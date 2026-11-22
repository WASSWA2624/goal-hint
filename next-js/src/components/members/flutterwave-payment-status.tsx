"use client";

import { Button } from "@/components/ui/controls";
import type { CheckoutRequest } from "@/domain/checkout";
import { validFlutterwaveCheckoutUrl } from "@/domain/flutterwave-checkout";
import type { PublicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { CheckoutActions, CheckoutPanel, CheckoutSupport } from "./checkout-parts";

const copy = {
  "provider-pending": ["checkout.flutterwave.statusPending", "checkout.flutterwave.pending"],
  rejected: ["checkout.flutterwave.statusFailed", "checkout.flutterwave.failed"],
  cancelled: ["checkout.flutterwave.statusCancelled", "checkout.flutterwave.cancelled"],
  approved: ["checkout.flutterwave.statusApproved", null],
  reversed: ["checkout.flutterwave.statusReversed", "checkout.flutterwave.reversed"],
} as const;

export function FlutterwavePaymentStatus({ locale, request, settings, first, busy, available, checkoutClosed, onCheck, onChoose }: {
  locale: string; request: CheckoutRequest; settings: PublicSubscriptionSettings; first: boolean; busy: boolean; available: boolean;
  checkoutClosed: boolean; onCheck: () => void; onChoose?: (() => void) | undefined;
}) {
  const m = createMessages(locale);
  const [title, description] = copy[request.status as keyof typeof copy] ?? copy["provider-pending"];
  const pending = request.status === "provider-pending";
  const checkable = pending || request.status === "rejected" || request.status === "cancelled";
  const resume = available && checkable && request.checkoutUrl && validFlutterwaveCheckoutUrl(request.checkoutUrl) ? request.checkoutUrl : null;
  return <CheckoutPanel id={first ? "report" : undefined} data-checkout-status={request.status} aria-busy={busy}>
    <header role="status">
      <h2>{m.text(title)}</h2>
      <p>{m.text("subscribe.referenceLabel")} <strong>{request.reference}</strong></p>
    </header>
    <p>{request.planName} · {formatUgx(request.priceUgx)}</p>
    {checkoutClosed && pending && <p>{m.text("checkout.flutterwave.checkoutClosed")}</p>}
    {description && <p>{m.text(description)}</p>}
    {request.status === "approved" && request.endsAt && <p>{m.text("checkout.flutterwave.approved", { time: formatPeriodEnd(new Date(request.endsAt)) })}</p>}
    <CheckoutActions>
      {checkable && <Button type="button" variant="secondary" disabled={busy} onClick={onCheck}>{m.text("checkout.flutterwave.checkStatus")}</Button>}
      {resume && <Button type="button" disabled={busy} onClick={() => window.location.assign(resume)}>
        {m.text(pending ? "checkout.flutterwave.resume" : "checkout.flutterwave.retry")}
      </Button>}
      {onChoose && <Button type="button" variant="secondary" disabled={busy} onClick={onChoose}>
        {m.text(pending ? "checkout.flutterwave.anotherMethod" : "checkout.flutterwave.newPurchase")}
      </Button>}
    </CheckoutActions>
    <CheckoutSupport settings={settings} reference={request.reference} />
  </CheckoutPanel>;
}
