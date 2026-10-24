import { subscriptionDayMs } from "./subscription-period.ts";

/**
 * Account credit: plan-only, non-refundable credit an account holds. It comes only from payments the owner approves (a top-up,
 * or what a plan payment received above the plan's price) and is spent on plans at once, by the member or by auto-renewal.
 * A balance goes below zero only when the owner reverses a payment whose credit was already spent (or moves that debt with a
 * number change); a negative balance blocks spending until it is topped up.
 */
export const walletRules = Object.freeze({
  topUpMinUgx: 1_000,
  topUpMaxUgx: 500_000,
  /** The most a single approval may add above a plan's price; more needs an owner adjustment. */
  excessMaxUgx: 500_000,
  /** Owner adjustments and transfers stay within the ledger's bounds. */
  adjustmentMaxUgx: 500_000,
  /** A period ending within this lead is renewed from credit; it must stay below the shortest plan (1 day). */
  renewLeadMs: 60 * 60_000,
  /** The background job renews only lapses this recent, so a long worker outage never charges absent members. */
  jobMaxLapseMs: subscriptionDayMs,
  jobSlotMs: 15 * 60_000,
});

export const walletKinds = ["topup", "overpayment", "purchase", "renewal", "reversal", "adjustment", "transfer"] as const;
export type WalletKind = (typeof walletKinds)[number];
/** A ledger row as members and the owner see it; actor is a role, never an identity. */
export type WalletEntryView = Readonly<{ id: string; kind: WalletKind; amountUgx: number; balanceAfter: number; createdAt: string;
  actor: "admin" | "member" | "system"; note: string | null; payment: string | null; period: string | null }>;
/** What a member sees of their credit: the balance, auto-renewal and recent history. */
export type CreditView = Readonly<{ balanceUgx: number; autoRenew: boolean; autoRenewPlanId: string | null; history: readonly WalletEntryView[] }>;

export const validTopUp = (amount: unknown): amount is number =>
  typeof amount === "number" && Number.isSafeInteger(amount) && amount >= walletRules.topUpMinUgx && amount <= walletRules.topUpMaxUgx;

/** Whether a chain ending at `endsAt` is due for renewal at `now`; `maxLapseMs` bounds how long ago it may have ended. */
export function renewalDue(endsAt: Date, now: Date, leadMs = walletRules.renewLeadMs, maxLapseMs?: number): boolean {
  return +endsAt <= +now + leadMs && (maxLapseMs === undefined || +endsAt >= +now - maxLapseMs);
}

/** How members and the owner read a ledger row. */
export const walletKindLabels: Readonly<Record<WalletKind, string>> = Object.freeze({ topup: "Top-up", overpayment: "Extra paid", purchase: "Plan bought",
  renewal: "Auto-renewal", reversal: "Payment reversed", adjustment: "Correction", transfer: "Number change" });
export const formatCredit = (amount: number) => `${amount < 0 ? "−" : ""}UGX ${Math.abs(amount).toLocaleString("en-UG")}`;
export const formatCreditChange = (amount: number) => `${amount < 0 ? "−" : "+"}UGX ${Math.abs(amount).toLocaleString("en-UG")}`;
