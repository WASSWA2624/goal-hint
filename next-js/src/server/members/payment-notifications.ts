import "server-only";

import { authLabels } from "../../i18n/messages/auth.ts";
import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { createYoolaMessaging, type SmsMessaging } from "./yoola-messaging.ts";

type PaymentReceipt = Readonly<{ paymentId: string; accountId: string; phone: string | null; reference: string }>;
export type PaymentApprovalNotification = PaymentReceipt & Readonly<{ planName: string; expiresAt: Date; creditAddedUgx?: number }>;
export type PaymentRejectionNotification = PaymentReceipt & Readonly<{ reason: string }>;
export type CreditNotification = PaymentReceipt & Readonly<{ addedUgx: number; balanceUgx: number }>;
export type RenewalNotification = Readonly<{ accessCodeId: string; accountId: string; phone: string | null; planName: string; expiresAt: Date; balanceUgx: number }>;
export type PaymentNotificationEvent = Readonly<{ accountId: string; targetType: "payment" | "access-code"; targetId: string;
  decision: "approved" | "rejected" | "credited" | "renewed"; at: Date }>;
export type PaymentNotifications = Readonly<{
  /** Persist inside the same account-locked transaction as the decision. Injected transports may omit this hook. */
  enqueue?(tx: Prisma.TransactionClient, event: PaymentNotificationEvent): Promise<void>;
  approved(payment: PaymentApprovalNotification): Promise<PaymentNotificationStatus>;
  rejected(payment: PaymentRejectionNotification): Promise<PaymentNotificationStatus>;
  credited(payment: CreditNotification): Promise<PaymentNotificationStatus>;
  renewed(renewal: RenewalNotification): Promise<PaymentNotificationStatus>;
}>;
// The gateway and lock-screen previews can expose message contents. Keep financial and subscription details in the app.
export const accountUpdateMessage = `Goal Hint: Your account has been updated. ${authLabels.signIn} to view the details or contact admin for help.`;

/** Explicit transport adapter for injected callers. Decision services default to the atomic outbox producer. */
export function createPaymentNotifications({ database, now = Date.now, delivery = createYoolaMessaging() }: {
  database: DatabaseRuntime; now?: () => number; delivery?: SmsMessaging;
}): PaymentNotifications {
  async function send(payment: Readonly<{ paymentId: string; accountId: string; phone: string | null }>, decision: "approved" | "rejected" | "credited" | "renewed",
    targetType: "payment" | "access-code" = "payment"): Promise<PaymentNotificationStatus> {
    let status: PaymentNotificationStatus;
    if (!payment.phone) status = "unavailable";
    else if (!supportedMessageChannels(payment.phone).includes("sms")) status = "unsupported";
    else {
      try { await delivery.sendSms({ phone: payment.phone, message: accountUpdateMessage }); status = "sent"; }
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
      return send(payment, "approved");
    },
    credited(payment: CreditNotification) {
      return send(payment, "credited");
    },
    renewed(renewal: RenewalNotification) {
      return send({ paymentId: renewal.accessCodeId, accountId: renewal.accountId, phone: renewal.phone }, "renewed", "access-code");
    },
    rejected(payment: PaymentRejectionNotification) {
      return send(payment, "rejected");
    },
  });
}
