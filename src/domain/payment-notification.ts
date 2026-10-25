export type PaymentNotificationStatus = "queued" | "sent" | "failed" | "unsupported" | "unavailable";

const notices: Readonly<Record<PaymentNotificationStatus, string>> = Object.freeze({
  queued: "Account update SMS queued for delivery.",
  sent: "SMS accepted for delivery.",
  failed: "SMS delivery could not be confirmed. Contact the member.",
  unsupported: "SMS is not supported for this account's country. Contact the member.",
  unavailable: "SMS was not sent because the account has no registered phone number. Contact the member.",
});

/** Only payment responses carry this status; unrelated or unknown response fields add no notice. */
export function paymentNotificationNotice(status: unknown): string | null {
  return typeof status === "string" && Object.hasOwn(notices, status) ? notices[status as PaymentNotificationStatus] : null;
}
