export type PaymentNotificationStatus = "queued" | "sent" | "failed" | "uncertain" | "unsupported" | "unavailable";

const notices: Readonly<Record<PaymentNotificationStatus, string>> = Object.freeze({
  queued: "Account update SMS queued for delivery.",
  sent: "SMS accepted for delivery.",
  uncertain: "SMS delivery could not be confirmed and will not be resent automatically. Contact the member.",
  failed: "SMS delivery could not be confirmed. Contact the member.",
  unsupported: "SMS is not supported for this account's country. Contact the member.",
  unavailable: "SMS was not sent because the account has no registered phone number. Contact the member.",
});

/** Only payment responses carry this status; unrelated or unknown response fields add no notice. */
export function paymentNotificationNotice(status: unknown): string | null {
  return typeof status === "string" && Object.hasOwn(notices, status) ? notices[status as PaymentNotificationStatus] : null;
}

export const paymentNoticeRules = Object.freeze({ stuckAfterMs: 15 * 60_000, interruptedAfterMs: 60_000, keepAcceptedDays: 7, keepUndeliveredDays: 30 });
export function paymentNoticeKindLabel(kind: string): string {
  return kind === "credited" ? "Credit" : kind === "renewed" ? "Renewal" : "Payment decision";
}
/** Delivery states describe the gateway boundary and never establish handset receipt. */
export function paymentNoticeLabel({ state, createdAt }: Readonly<{ state: string; createdAt: string | Date }>, now: number): string {
  switch (state) {
    case "sent": return "Accepted by the SMS gateway (not proof of receipt)";
    case "queued": return now - +new Date(createdAt) >= paymentNoticeRules.stuckAfterMs ? "Waiting · check SMS settings and the private worker" : "Waiting to send";
    case "dispatching": return "Sending";
    case "failed": case "uncertain": return "Not confirmed · not resent automatically";
    case "unsupported": return "Country not supported";
    case "unavailable": return "No registered number";
    case "cancelled": return "Account unavailable";
    default: return "Not sent";
  }
}
