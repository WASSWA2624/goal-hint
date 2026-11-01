import { z } from "zod";

export const checkoutRules = Object.freeze({ reservationMs: 48 * 3_600_000, pageSize: 30, maximumUgx: 2_000_000_000 });
export const checkoutOpenStatuses = ["pending", "remaining", "disputed", "correction", "reconfirm"] as const;
export const duplicateReceiptMessage = "This transaction is already linked to a payment request. Contact support with your request ID.";
export const checkoutLabels: Record<string, string> = {
  pending: "Submitted — awaiting admin approval", remaining: "Awaiting remaining payment", disputed: "Disputed — under review",
  approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", correction: "Correction requested", reconfirm: "Confirmation required",
  superseded: "Replaced report",
};
const money = z.number().int().min(0).max(checkoutRules.maximumUgx);
export const checkoutSelectionSchema = z.object({
  purpose: z.enum(["plan", "referral", "topup"]), planId: z.uuid().nullable(), topUpUgx: money.default(0),
  method: z.enum(["mtn", "airtel", "wallet", "referral"]), walletUgx: money, referralDays: z.number().int().min(0).max(365),
}).strict();
export type CheckoutSelection = z.infer<typeof checkoutSelectionSchema>;
export const receiptInputSchema = z.object({
  transactionId: z.string().trim().min(4).max(40), amountUgx: money.min(1), payerPhone: z.string().min(8).max(20),
  paidAt: z.iso.datetime({ offset: true }),
  original: z.object({ text: z.string().max(12_000), extracted: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) }).strict(),
}).strict();
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
export type CheckoutQuote = CheckoutSelection & { quoteKey: string; planName: string; priceUgx: number; durationDays: number;
  amountToSend: number; availableWalletUgx: number; availableReferralDays: number; recipient: string | null; recipientName: string | null };
export type CheckoutRequest = { id: string; reference: string; status: string; purpose: string; method: string; planId: string | null;
  planName: string; priceUgx: number; durationDays: number; walletUgx: number; referralDays: number; amountToSend: number;
  reportedUgx: number; verifiedUgx: number; remainingUgx: number; excessUgx: number; endsAt: string | null;
  reservationUntil: string | null; reason: string | null; revision: number;
  receipts: { id: string; transactionId: string; amountUgx: number; paidAt: string; verified: boolean; disputed: boolean; withdrawn: boolean }[] };
export type CheckoutView = { availableWalletUgx: number; availableReferralDays: number; lastMethod: string | null; requests: CheckoutRequest[] };
export function checkoutMethodAvailable(method: string, balances: Pick<CheckoutView, "availableWalletUgx" | "availableReferralDays">,
  providers: { mtnNumber: string | null; airtelNumber: string | null }, priceUgx: number) {
  return method === "mtn" ? !!providers.mtnNumber : method === "airtel" ? !!providers.airtelNumber
    : method === "wallet" ? balances.availableWalletUgx >= priceUgx : method === "referral" && balances.availableReferralDays > 0;
}
export function fundingAmounts(priceUgx: number, walletUgx: number, externalUgx = 0) {
  const amountToSend = Math.max(0, priceUgx - walletUgx);
  return { amountToSend, remainingUgx: Math.max(0, amountToSend - externalUgx), excessUgx: Math.max(0, externalUgx - amountToSend) };
}
