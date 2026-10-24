import { validMobilePhone, type MobileNetwork } from "./phone.ts";

// The amount is never sent: the server records the chosen plan's price. The owner verifies the transaction ID,
// money and payer in their own wallet before approving; a screenshot is optional supporting evidence.
export const paymentFields = ["planId", "payerPhone", "network", "transactionId", "accepted"] as const;
/** Payment references are displayed without punctuation; the stored four-character key stays unchanged. */
export const formatPaymentReference = (reference: string) => `P${reference}`;
export const normalizeTransactionId = (value: string) => value.trim().toUpperCase().replace(/[\s-]/gu, "");
export const transactionKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
export function parseTransactionId(value: unknown): string | null {
  const id = typeof value === "string" ? normalizeTransactionId(value) : "";
  return /^[A-Z0-9.-]{4,40}$/u.test(id) && transactionKey(id) ? id : null;
}
export type PaymentFields = Readonly<{ planId: string; payerPhone: string; network: MobileNetwork;
  transactionId: string; accepted: boolean }>;
export function parsePaymentFields(input: Record<string, unknown>): PaymentFields | null {
  if (Object.keys(input).some((key) => !(paymentFields as readonly string[]).includes(key))) return null;
  const payerPhone = validMobilePhone(input.payerPhone), network = input.network;
  const transactionId = parseTransactionId(input.transactionId);
  if (!payerPhone || !["mtn", "airtel"].includes(String(network))
    || !transactionId
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
