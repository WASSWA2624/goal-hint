import { fundingAmounts, type CheckoutQuote, type CheckoutSelection, type CheckoutView } from "@/domain/checkout";
import type { ManualPaymentSettings } from "@/domain/subscription-settings";

export const fixtureManualMethods = {
  mtnEnabled: true, mtnNumber: "256700000901", mtnName: "SYNTHETIC MTN PAYEE",
  airtelEnabled: true, airtelNumber: "256700000902", airtelName: "SYNTHETIC AIRTEL PAYEE",
} satisfies ManualPaymentSettings;

export const fixtureCheckoutPlans = [
  { id: "00000000-0000-4000-8000-000000000201", name: "Daily", priceUgx: 1000, durationDays: 1 },
  { id: "00000000-0000-4000-8000-000000000202", name: "Weekly", priceUgx: 5000, durationDays: 7 },
].map((plan, sortOrder) => ({ ...plan, active: true, sortOrder,
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" }));

export function fixtureCheckoutView(scenario?: string): CheckoutView {
  return { availableWalletUgx: scenario === "wallet-only" ? 1000 : 0, availableReferralDays: 0, lastMethod: null, requests: [] };
}

export function fixtureCheckoutQuote(selection: CheckoutSelection, scenario?: string): CheckoutQuote | null {
  const plan = fixtureCheckoutPlans.find(item => item.id === selection.planId);
  if (selection.purpose === "plan" && !plan) return null;
  const { availableWalletUgx, availableReferralDays } = fixtureCheckoutView(scenario);
  const walletUgx = Math.min(selection.walletUgx, availableWalletUgx);
  const provider = selection.method === "mtn" || selection.method === "airtel" ? selection.method : null;
  const priceUgx = selection.purpose === "topup" ? selection.topUpUgx : plan?.priceUgx ?? 0;
  return { ...selection, walletUgx, priceUgx, ...fundingAmounts(priceUgx, walletUgx),
    planName: plan?.name ?? "Account credit", durationDays: plan?.durationDays ?? 0,
    availableWalletUgx, availableReferralDays,
    recipient: provider ? fixtureManualMethods[`${provider}Number`] : null,
    recipientName: provider ? fixtureManualMethods[`${provider}Name`] : null,
    quoteKey: `synthetic:${JSON.stringify(selection)}` };
}
