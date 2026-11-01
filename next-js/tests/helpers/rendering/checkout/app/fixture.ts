import type { CheckoutQuote, CheckoutRequest, CheckoutSelection, CheckoutView } from "@/domain/checkout";
import { fundingAmounts } from "@/domain/checkout";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
export const settings = { ...defaultSubscriptionSettings, paywallMode: "test" as const, mtnNumber: "256700000901", mtnName: "SYNTHETIC MTN PAYEE",
  airtelNumber: "256700000902", airtelName: "SYNTHETIC AIRTEL PAYEE", contactPhone: "256700000903", whatsappPhone: "256700000904" };
export const plans = [1, 7, 30].map((durationDays, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`,
  name: ["Daily", "Weekly", "Monthly"][i]!, priceUgx: [1000, 5000, 20000][i]!, durationDays, active: true, sortOrder: i, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" }));
const state = globalThis as typeof globalThis & { checkoutFixture?: CheckoutView };
export function view(): CheckoutView { return state.checkoutFixture ??= { availableWalletUgx: 3000, availableReferralDays: 7, lastMethod: null, requests: [] }; }
export function quote(selection: CheckoutSelection): CheckoutQuote {
  const plan = plans.find(p => p.id === selection.planId) ?? plans[0]!;
  const priceUgx = selection.purpose === "referral" ? 0 : selection.purpose === "topup" ? selection.topUpUgx : plan.priceUgx;
  return { ...selection, planName: selection.purpose === "referral" ? "Referral days" : plan.name, priceUgx,
    durationDays: selection.purpose === "plan" ? plan.durationDays : 0, ...fundingAmounts(priceUgx, selection.walletUgx),
    availableWalletUgx: view().availableWalletUgx, availableReferralDays: view().availableReferralDays,
    recipient: selection.method === "mtn" ? settings.mtnNumber : selection.method === "airtel" ? settings.airtelNumber : null,
    recipientName: selection.method === "mtn" ? settings.mtnName : selection.method === "airtel" ? settings.airtelName : null,
    quoteKey: `synthetic:${JSON.stringify(selection)}` };
}
export function confirm(selection: CheckoutSelection, id: string, proof?: { transactionId: string; amountUgx: number; paidAt: string }): CheckoutRequest {
  const existing = view().requests.find(r => r.id === id); if (existing) return existing;
  const q = quote(selection), external = q.amountToSend > 0;
  const row: CheckoutRequest = { ...q, id, reference: "PTEST", status: external ? "pending" : "approved", method: selection.method,
    reportedUgx: proof?.amountUgx ?? 0, verifiedUgx: 0, remainingUgx: q.amountToSend, excessUgx: 0,
    reservationUntil: external ? new Date(Date.now() + 48 * 3600000).toISOString() : null,
    endsAt: external ? null : new Date(Date.now() + (q.durationDays + q.referralDays) * 86400000).toISOString(), reason: null, revision: 0,
    receipts: proof ? [{ id: crypto.randomUUID(), transactionId: proof.transactionId, amountUgx: proof.amountUgx, paidAt: proof.paidAt, verified: false, disputed: false, withdrawn: false }] : [] };
  view().requests.unshift(row); view().availableWalletUgx -= q.walletUgx; view().availableReferralDays -= q.referralDays;
  return row;
}
