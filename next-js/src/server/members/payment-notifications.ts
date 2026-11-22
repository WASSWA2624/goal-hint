import "server-only";

import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";

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

/** Payment decisions stay visible in the app. External member delivery is reserved for password recovery. */
export const disabledMemberPaymentNotifications: PaymentNotifications = Object.freeze({
  approved: skipped,
  credited: skipped,
  renewed: skipped,
  rejected: skipped,
});

async function skipped(): Promise<PaymentNotificationStatus> {
  return "skipped";
}
