import type { PaymentCheck } from "./code-delivery.ts";
export type OwnerPayment = Readonly<{ id: string; reference: string; accountId: string; accountPhone: string | null; payerPhone: string | null;
  network: string; transactionId: string; amount: number; planId: string; planName: string; price: number; submittedAt: string; status: string; hasImage: boolean;
  final: Readonly<{ network: string | null; transactionId: string; amount: number | null }> | null; checks: readonly PaymentCheck[] }>;
export type PaymentQueue = Readonly<{ pendingCount: number; trials: readonly Readonly<{ id: string; phone: string | null; trialRequestedAt: string; ipCount: number | null }>[]; payments: readonly OwnerPayment[] }>;
export type OwnerCode = Readonly<{ id: string; accountId: string; reference: string; phone: string | null; planName: string; source: string; startsAt: string; endsAt: string; status: "revoked" | "queued" | "active" | "expired"; daysLeft: number }>;
