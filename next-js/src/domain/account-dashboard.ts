/** A bounded member-facing summary, never an owner audit log or payment credential. */
export type AccountActivity = Readonly<{ id: string; at: string; planName: string }> & (
  Readonly<{ kind: "payment"; status: "pending" | "superseded" | "approved" | "rejected" | "reversed"; reference: string; purpose: "plan" | "topup" }>
  | Readonly<{ kind: "access"; status: "added" | "removed"; startsAt: string; endsAt: string }>
  | Readonly<{ kind: "referral"; status: "rewarded" }>
);
export type AccountDashboard = Readonly<{ activePlanName: string | null; activity: readonly AccountActivity[] }>;
export const accountActivityLimit = 10;
