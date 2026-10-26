import type { MobileNetwork } from "./phone.ts";
import { validMobilePhone } from "./phone-mobile.ts";
import { validTopUp, type CreditView } from "./wallet.ts";

// A plan report claims the chosen plan's price; a top-up (purpose "topup", no plan) claims the amount the member chose to add
// (topUpAmount). A transaction ID is required; a screenshot is optional. The amount the browser read from an attached image
// (screenshotAmount, possibly empty) is only a hint for the owner, who verifies the ID, money and payer in their own wallet
// before approving. Every field is sent once: planId is empty for a top-up and topUpAmount for a plan.
export const paymentFields = ["purpose", "planId", "topUpAmount", "payerPhone", "network", "transactionId", "screenshotAmount", "accepted"] as const;
/** Payment references are displayed without punctuation; the stored four-character key stays unchanged. */
export const formatPaymentReference = (reference: string) => `P${reference}`;
export const normalizeTransactionId = (value: string) => value.trim().toUpperCase().replace(/[\s-]/gu, "");
export const transactionKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
export function parseTransactionId(value: unknown): string | null {
  const id = typeof value === "string" ? normalizeTransactionId(value) : "";
  return /^[A-Z0-9.-]{4,40}$/u.test(id) && transactionKey(id) ? id : null;
}
/** screenshotAmount is null when the browser could not read an amount; it is never the claimed amount. */
export type PaymentFields = Readonly<{ payerPhone: string; network: MobileNetwork; transactionId: string; screenshotAmount: number | null; accepted: boolean }>
  & (Readonly<{ purpose?: "plan"; planId: string; topUpUgx?: null }> | Readonly<{ purpose: "topup"; planId?: null; topUpUgx: number }>);
const parseScreenshotAmount = (value: unknown): number | null | undefined => value === undefined || value === "" ? null
  : typeof value === "string" && /^[1-9]\d{2,7}$/u.test(value) && Number(value) <= 10_000_000 ? Number(value) : undefined;
export function parsePaymentFields(input: Record<string, unknown>): PaymentFields | null {
  if (Object.keys(input).some((key) => !(paymentFields as readonly string[]).includes(key))) return null;
  const payerPhone = validMobilePhone(input.payerPhone), network = input.network;
  const transactionId = parseTransactionId(input.transactionId), screenshotAmount = parseScreenshotAmount(input.screenshotAmount);
  const purpose = input.purpose === undefined ? "plan" : input.purpose;
  const topUp = typeof input.topUpAmount === "string" && /^[1-9]\d{3,5}$/u.test(input.topUpAmount) ? Number(input.topUpAmount) : null;
  if (!payerPhone || !["mtn", "airtel"].includes(String(network))
    || !transactionId || screenshotAmount === undefined
    || !["true", "false"].includes(String(input.accepted))) return null;
  const shared = { payerPhone, network: network as MobileNetwork, transactionId, screenshotAmount, accepted: input.accepted === "true" };
  if (purpose === "topup") {
    return (input.planId === undefined || input.planId === "") && validTopUp(topUp) ? { ...shared, purpose, topUpUgx: topUp } : null;
  }
  if (purpose !== "plan" || typeof input.planId !== "string" || !/^[0-9a-f-]{36}$/u.test(input.planId)
    || input.topUpAmount !== undefined && input.topUpAmount !== "") return null;
  return { ...shared, purpose, planId: input.planId };
}
export const paymentRules = Object.freeze({ bodyBytes: 3_200_000, imageBytes: 3_000_000, deadlineMs: 90_000,
  sessionStored: 3, sessionAttempts: 10, ipAttempts: 50, ipBytes: 50_000_000, siteBytes: 100_000_000 });
/**
 * The account's latest report. rejectText is the owner's own words (null when none); rejectReason is the chosen reason code.
 * A top-up (purpose "topup") has planName "Account credit" and priceUgx the amount to add.
 */
export type PaymentStatus = Readonly<{ reference: string; status: string; rejectText: string | null; rejectReason: string | null;
  planName: string; priceUgx: number; submittedAt: string; endsAt: string | null; purpose?: "plan" | "topup" }>;
/**
 * trialPending: a trial was requested and the owner has neither granted nor dismissed it (the account has no access period).
 * credit is the account's balance, auto-renewal and recent history; null when the session cannot see it. otherStatus is the
 * latest report of the other purpose (a plan report behind a newer top-up, or the reverse) while it still waits, or once it
 * was refused or reversed after the newer report was sent.
 */
export type PaymentView = Readonly<{ acceptedTerms: boolean; trialEligible: boolean; trialPending: boolean; status: PaymentStatus | null; credit?: CreditView | null;
  otherStatus?: PaymentStatus | null }>;

export function canOpenMoneyMenu(userAgent: string): boolean {
  return /Android/iu.test(userAgent) && !/;\s*wv\)|FBAN|FBAV|Instagram/iu.test(userAgent);
}
