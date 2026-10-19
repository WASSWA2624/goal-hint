import { normalizePhone, type MobileNetwork } from "./phone.ts";

export const paymentFields = ["planId", "payerPhone", "network", "transactionId", "amount", "accepted"] as const;
export const normalizeTransactionId = (value: string) => value.trim().toUpperCase().replace(/\s/gu, "");
export const transactionKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
export type PaymentFields = Readonly<{ planId: string; payerPhone: string; network: MobileNetwork;
  transactionId: string; amount: number; accepted: boolean }>;
export function parsePaymentFields(input: Record<string, unknown>): PaymentFields | null {
  if (Object.keys(input).some((key) => !(paymentFields as readonly string[]).includes(key))) return null;
  const payerPhone = normalizePhone(input.payerPhone), network = input.network;
  const transactionId = typeof input.transactionId === "string" ? normalizeTransactionId(input.transactionId) : "";
  const amount = typeof input.amount === "string" && /^\d{1,8}$/u.test(input.amount) ? Number(input.amount) : NaN;
  if (!payerPhone || !["mtn", "airtel"].includes(String(network)) || !/^[A-Z0-9.-]{4,40}$/u.test(transactionId)
    || !transactionKey(transactionId) || !Number.isInteger(amount) || amount < 100 || amount > 10_000_000
    || typeof input.planId !== "string" || !/^[0-9a-f-]{36}$/u.test(input.planId)
    || !["true", "false"].includes(String(input.accepted))) return null;
  return { planId: input.planId, payerPhone, network: network as MobileNetwork, transactionId, amount, accepted: input.accepted === "true" };
}
export const paymentRules = Object.freeze({ bodyBytes: 3_200_000, imageBytes: 3_000_000, deadlineMs: 90_000,
  sessionStored: 3, sessionAttempts: 10, ipAttempts: 50, ipBytes: 50_000_000, siteBytes: 100_000_000 });
export type PaymentStatus = Readonly<{ reference: string; status: string; rejectText: string | null;
  planName: string; priceUgx: number; endsAt: string | null }>;
export type PaymentView = Readonly<{ acceptedTerms: boolean; trialEligible: boolean; trialRequested: boolean; status: PaymentStatus | null }>;

export function canOpenMoneyMenu(userAgent: string): boolean {
  return /Android/iu.test(userAgent) && !/;\s*wv\)|FBAN|FBAV|Instagram/iu.test(userAgent);
}
