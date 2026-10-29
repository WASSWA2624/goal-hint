export type PaymentNotificationStatus = "queued" | "sent" | "failed" | "uncertain" | "unsupported" | "unavailable" | "skipped";

const notices: Readonly<Record<PaymentNotificationStatus, string>> = Object.freeze({
  queued: "Account update queued for delivery.",
  sent: "Message accepted for delivery.",
  uncertain: "Message delivery could not be confirmed and will not be resent automatically. Contact the member.",
  failed: "Message delivery could not be confirmed. Contact the member.",
  unsupported: "The delivery channel is not supported for this account's country. Contact the member.",
  unavailable: "Message was not sent because no registered phone number is available for verified delivery. Contact the member.",
  skipped: "No account update message was queued.",
});

/** Only payment responses carry this status; unrelated or unknown response fields add no notice. */
export function paymentNotificationNotice(status: unknown): string | null {
  return typeof status === "string" && Object.hasOwn(notices, status) ? notices[status as PaymentNotificationStatus] : null;
}

export const paymentNoticeRules = Object.freeze({ stuckAfterMs: 15 * 60_000, interruptedAfterMs: 60_000, keepAcceptedDays: 7, keepUndeliveredDays: 30 });
export function paymentNoticeKindLabel(kind: string): string {
  return kind === "credited" ? "Credit" : kind === "renewed" ? "Renewal" : kind === "welcome" ? "Account welcome" : kind === "received" ? "Payment report" : "Payment decision";
}
/** Delivery states describe the gateway boundary and never establish handset receipt. */
export function paymentNoticeLabel({ state, createdAt }: Readonly<{ state: string; createdAt: string | Date }>, now: number): string {
  switch (state) {
    case "sent": return "Accepted by the message gateway (not proof of receipt)";
    case "queued": return now - +new Date(createdAt) >= paymentNoticeRules.stuckAfterMs ? "Waiting · check messaging settings and the private worker" : "Waiting to send";
    case "dispatching": return "Sending";
    case "failed": case "uncertain": return "Not confirmed · not resent automatically";
    case "unsupported": return "Country not supported";
    case "unavailable": return "Verified registered number unavailable";
    case "cancelled": return "Account unavailable";
    case "skipped": return "WhatsApp not enabled by member";
    default: return "Not sent";
  }
}
