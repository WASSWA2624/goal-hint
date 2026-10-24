import "server-only";

import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { createYoolaMessaging, type SmsMessaging } from "./yoola-messaging.ts";

type PaymentReceipt = Readonly<{ paymentId: string; accountId: string; phone: string | null; reference: string }>;
export type PaymentApprovalNotification = PaymentReceipt & Readonly<{ planName: string; expiresAt: Date; creditAddedUgx?: number }>;
export type PaymentRejectionNotification = PaymentReceipt & Readonly<{ reason: string }>;
export type CreditNotification = PaymentReceipt & Readonly<{ addedUgx: number; balanceUgx: number }>;
export type RenewalNotification = Readonly<{ accessCodeId: string; accountId: string; phone: string | null; planName: string; expiresAt: Date; balanceUgx: number }>;
export type PaymentNotifications = Readonly<{
  approved(payment: PaymentApprovalNotification): Promise<PaymentNotificationStatus>;
  rejected(payment: PaymentRejectionNotification): Promise<PaymentNotificationStatus>;
  credited(payment: CreditNotification): Promise<PaymentNotificationStatus>;
  renewed(renewal: RenewalNotification): Promise<PaymentNotificationStatus>;
}>;
const shillings = (amount: number) => `UGX ${amount.toLocaleString("en-UG")}`;
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();

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
  async function send(payment: Readonly<{ paymentId: string; accountId: string; phone: string | null }>, decision: "approved" | "rejected" | "credited" | "renewed",
    message: () => string, targetType: "payment" | "access-code" = "payment"): Promise<PaymentNotificationStatus> {
    let status: PaymentNotificationStatus;
    if (!payment.phone) status = "unavailable";
    else if (!supportedMessageChannels(payment.phone).includes("sms")) status = "unsupported";
    else {
      try { await delivery.sendSms({ phone: payment.phone, message: message() }); status = "sent"; }
      catch { status = "failed"; }
    }
    // Neither provider nor audit failures may turn a committed approval/rejection into an apparent failed decision.
    try {
      await database.transaction(async tx => {
        // Delivery happens after the decision commits; deletion may finish while the provider is responding.
        // Share deletion's account lock so an accepted SMS cannot recreate the account's erased audit data.
        const account = await lockMemberAccount(tx, payment.accountId);
        if (!account || account.erasedAt) return;
        await writeOwnerAudit(tx, { at: new Date(now()), actor: "system:payment-sms", action: "payment_sms_attempted",
          accountId: payment.accountId, targetType, targetId: payment.paymentId, details: { decision, status } });
      }, { isolationLevel: "ReadCommitted" });
    } catch { /* The administrator still receives the delivery status in the decision response. */ }
    return status;
  }
  return Object.freeze({
    approved(payment: PaymentApprovalNotification) {
      return send(payment, "approved", () => `Goal Hint: Payment ${payment.reference} approved. ${cleanName(payment.planName)} subscription expires on ${expiryDate(payment.expiresAt)}.`
        + (payment.creditAddedUgx ? ` ${shillings(payment.creditAddedUgx)} extra was added to your credit.` : "") + " Thank you.");
    },
    credited(payment: CreditNotification) {
      return send(payment, "credited", () => `Goal Hint: Payment ${payment.reference} approved. ${shillings(payment.addedUgx)} added to your credit; balance ${shillings(payment.balanceUgx)}. Thank you.`);
    },
    renewed(renewal: RenewalNotification) {
      return send({ paymentId: renewal.accessCodeId, accountId: renewal.accountId, phone: renewal.phone }, "renewed",
        () => `Goal Hint: ${cleanName(renewal.planName)} renewed from your credit until ${expiryDate(renewal.expiresAt)}. Credit left ${shillings(renewal.balanceUgx)}.`, "access-code");
    },
    rejected(payment: PaymentRejectionNotification) {
      return send(payment, "rejected", () => `Goal Hint: Payment ${payment.reference} rejected. ${rejectionMessages.get(payment.reason) ?? ""} Sign in for details or contact admin.`.replace(/\s+/gu, " "));
    },
  });
}
