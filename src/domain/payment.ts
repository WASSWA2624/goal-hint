import { normalizePhone, type MobileNetwork } from "./phone.ts";

// The amount is never sent: the server records the chosen plan's price. The screenshot is the evidence; the owner checks the
// money, the transaction ID and the payer in their own wallet SMS before approving.
export const paymentFields = ["planId", "payerPhone", "network", "transactionId", "accepted"] as const;
/** May be left out or sent empty: a missing payer is the account number, and the owner reads the ID from the wallet SMS. */
export const optionalPaymentFields: readonly string[] = Object.freeze(["payerPhone", "transactionId"]);
export const normalizeTransactionId = (value: string) => value.trim().toUpperCase().replace(/\s/gu, "");
export const transactionKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
export type PaymentFields = Readonly<{ planId: string; payerPhone: string | null; network: MobileNetwork;
  transactionId: string | null; accepted: boolean }>;
const blank = (value: unknown) => value === undefined || value === null || typeof value === "string" && !value.trim();
export function parsePaymentFields(input: Record<string, unknown>): PaymentFields | null {
  if (Object.keys(input).some((key) => !(paymentFields as readonly string[]).includes(key))) return null;
  const payerPhone = blank(input.payerPhone) ? null : normalizePhone(input.payerPhone), network = input.network;
  const transactionId = blank(input.transactionId) ? null : typeof input.transactionId === "string" ? normalizeTransactionId(input.transactionId) : "";
  if (!blank(input.payerPhone) && !payerPhone || !["mtn", "airtel"].includes(String(network))
    || transactionId !== null && (!/^[A-Z0-9.-]{4,40}$/u.test(transactionId) || !transactionKey(transactionId))
    || typeof input.planId !== "string" || !/^[0-9a-f-]{36}$/u.test(input.planId)
    || !["true", "false"].includes(String(input.accepted))) return null;
  return { planId: input.planId, payerPhone, network: network as MobileNetwork, transactionId, accepted: input.accepted === "true" };
}
export const paymentRules = Object.freeze({ bodyBytes: 3_200_000, imageBytes: 3_000_000, deadlineMs: 90_000,
  sessionStored: 3, sessionAttempts: 10, ipAttempts: 50, ipBytes: 50_000_000, siteBytes: 100_000_000 });
/** The account's latest report. rejectText is the owner's own words (null when none); rejectReason is the chosen reason code. */
export type PaymentStatus = Readonly<{ reference: string; status: string; rejectText: string | null; rejectReason: string | null;
  planName: string; priceUgx: number; submittedAt: string; endsAt: string | null }>;
/** trialPending: a trial was requested and the owner has neither granted nor dismissed it (the account has no access period). */
export type PaymentView = Readonly<{ acceptedTerms: boolean; trialEligible: boolean; trialPending: boolean; status: PaymentStatus | null }>;

export function canOpenMoneyMenu(userAgent: string): boolean {
  return /Android/iu.test(userAgent) && !/;\s*wv\)|FBAN|FBAV|Instagram/iu.test(userAgent);
}
