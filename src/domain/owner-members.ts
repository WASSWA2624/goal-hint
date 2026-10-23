import type { PaymentCheck } from "./payment-checks.ts";
export type OwnerPayment = Readonly<{ id: string; reference: string; accountId: string; accountPhone: string | null; payerPhone: string | null;
  network: string; transactionId: string; amount: number; planId: string; planName: string; durationDays: number; price: number; submittedAt: string; status: string; hasImage: boolean;
  final: Readonly<{ network: string | null; transactionId: string; amount: number | null }> | null; checks: readonly PaymentCheck[] }>;
export type PaymentQueue = Readonly<{ pendingCount: number; trials: readonly Readonly<{ id: string; phone: string | null; trialRequestedAt: string; ipCount: number | null }>[]; payments: readonly OwnerPayment[] }>;
export type OwnerPaymentSummary = Pick<OwnerPayment, "id" | "reference" | "network" | "amount" | "submittedAt">;
export type OwnerCode = Readonly<{ id: string; accountId: string; reference: string; phone: string | null; planName: string; source: string; startsAt: string; endsAt: string; status: "revoked" | "queued" | "active" | "expired"; daysLeft: number }>;

export type OwnerOverview = Readonly<{ pending: number; active: number; weekRevenue: number; monthRevenue: number; trials: number; busy: number; paymentNumbersChangedAt: string | null }>;
export type OwnerAccount = Readonly<{ id: string; phone: string | null; status: string; lastSignInAt: string }>;
export type OwnerSubscriber = Readonly<{ id: string; phone: string | null; blockedAt: string | null; blockedReason: string | null; ownerNote: string | null; erasedAt: string | null; lastSignInAt: string;
  codes: readonly OwnerCode[]; submissions: readonly Readonly<{ id: string; reference: string; status: string; planName: string; claimedAmountUgx: number; amountReceivedUgx: number | null; submittedAt: string }>[];
  devices: readonly Readonly<{ createdAt: string; lastSeenAt: string; expiresAt: string }>[]; unlocks: number }>;
export type OwnerAuditRow = Readonly<{ id: string; at: string; actor: string; action: string; accountId: string | null; targetType: string; targetId: string }>;
