import type { PaymentCheck } from "./payment-checks.ts";
import type { WalletEntryView } from "./wallet.ts";
/** purpose `topup` is a credit top-up: no plan or days, and price is the amount the member chose to add. */
export type OwnerPayment = Readonly<{ id: string; reference: string; accountId: string; accountPhone: string | null; payerPhone: string | null;
  network: string; transactionId: string; amount: number; purpose: "plan" | "topup"; planId: string | null; planName: string; durationDays: number | null; price: number;
  submittedAt: string; status: string; hasImage: boolean; accountCreditUgx: number;
  final: Readonly<{ network: string | null; transactionId: string; amount: number | null }> | null; checks: readonly PaymentCheck[] }>;
export type PaymentQueue = Readonly<{ pendingCount: number; trials: readonly Readonly<{ id: string; phone: string | null; trialRequestedAt: string; ipCount: number | null }>[]; payments: readonly OwnerPayment[] }>;
export type OwnerPaymentSummary = Pick<OwnerPayment, "id" | "reference" | "network" | "amount" | "submittedAt">;
export type OwnerCode = Readonly<{ id: string; accountId: string; reference: string; phone: string | null; planName: string; source: string; startsAt: string; endsAt: string; status: "revoked" | "queued" | "active" | "expired"; daysLeft: number }>;
/** An account-update SMS that needs the owner's attention; reference is the payment's (P…) or the renewal period's (C…). */
export type OwnerNotice = Readonly<{ id: string; accountId: string; phone: string | null; kind: string; reference: string | null; state: string;
  lastError: string | null; attempts: number; createdAt: string; attemptedAt: string | null }>;

/** creditHeld is all positive balances (credit members may still spend); creditOwed the negative ones after reversals. */
export type OwnerOverview = Readonly<{ pending: number; active: number; weekRevenue: number; monthRevenue: number; trials: number; busy: number; paymentNumbersChangedAt: string | null;
  creditHeld: number; creditOwed: number }>;
export type OwnerAccount = Readonly<{ id: string; phone: string | null; status: string; lastSignInAt: string }>;
export type OwnerSubscriber = Readonly<{ id: string; phone: string | null; blockedAt: string | null; blockedReason: string | null; ownerNote: string | null; erasedAt: string | null; lastSignInAt: string;
  codes: readonly OwnerCode[]; submissions: readonly Readonly<{ id: string; reference: string; status: string; purpose: "plan" | "topup"; planName: string; claimedAmountUgx: number;
    amountReceivedUgx: number | null; submittedAt: string }>[];
  devices: readonly Readonly<{ createdAt: string; lastSeenAt: string; expiresAt: string }>[]; unlocks: number;
  creditUgx: number; autoRenew: boolean; autoRenewPlanName: string | null; wallet: readonly WalletEntryView[] }>;
export type OwnerAuditRow = Readonly<{ id: string; at: string; actor: string; action: string; accountId: string | null; targetType: string; targetId: string }>;
