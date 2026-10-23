import "server-only";

import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createYoolaMessaging, type SmsMessaging } from "./yoola-messaging.ts";

type PaymentReceipt = Readonly<{ paymentId: string; accountId: string; phone: string | null; reference: string }>;
export type PaymentApprovalNotification = PaymentReceipt & Readonly<{ planName: string; expiresAt: Date }>;
export type PaymentRejectionNotification = PaymentReceipt & Readonly<{ reason: string }>;
export type PaymentNotifications = Readonly<{
  approved(payment: PaymentApprovalNotification): Promise<PaymentNotificationStatus>;
  rejected(payment: PaymentRejectionNotification): Promise<PaymentNotificationStatus>;
}>;

const expiryFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", year: "numeric", month: "short", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const rejectionMessages = new Map([
  ["unreadable", "The payment proof was unreadable."],
  ["amount-mismatch", "The amount did not match the selected package."],
  ["not-received", "The payment could not be confirmed."],
  ["duplicate", "This transaction was already used."],
  ["wrong-number", "The payment was sent to the wrong number."],
]);

function expiryDate(instant: Date): string {
  const parts = Object.fromEntries(expiryFormat.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} EAT`;
}

/** Call only after the payment transaction commits. Provider acceptance is best effort and is never retried automatically. */
export function createPaymentNotifications({ database, now = Date.now, delivery = createYoolaMessaging() }: {
  database: DatabaseRuntime; now?: () => number; delivery?: SmsMessaging;
}): PaymentNotifications {
  async function send(payment: PaymentReceipt, decision: "approved" | "rejected", message: () => string): Promise<PaymentNotificationStatus> {
    let status: PaymentNotificationStatus;
    if (!payment.phone) status = "unavailable";
    else if (!supportedMessageChannels(payment.phone).includes("sms")) status = "unsupported";
    else {
      try { await delivery.sendSms({ phone: payment.phone, message: message() }); status = "sent"; }
      catch { status = "failed"; }
    }
    // Neither provider nor audit failures may turn a committed approval/rejection into an apparent failed decision.
    try {
      await database.query(tx => writeOwnerAudit(tx, { at: new Date(now()), actor: "system:payment-sms", action: "payment_sms_attempted",
        accountId: payment.accountId, targetType: "payment", targetId: payment.paymentId, details: { decision, status } }));
    } catch { /* The administrator still receives the delivery status in the decision response. */ }
    return status;
  }
  return Object.freeze({
    approved(payment: PaymentApprovalNotification) {
      return send(payment, "approved", () => {
        const planName = payment.planName.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
        return `Goal Hint: Payment ${payment.reference} approved. ${planName} subscription expires on ${expiryDate(payment.expiresAt)}. Thank you.`;
      });
    },
    rejected(payment: PaymentRejectionNotification) {
      return send(payment, "rejected", () => `Goal Hint: Payment ${payment.reference} rejected. ${rejectionMessages.get(payment.reason) ?? ""} Sign in for details or contact admin.`.replace(/\s+/gu, " "));
    },
  });
}
