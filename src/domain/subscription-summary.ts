import type { SubscriptionPeriod } from "./subscription-period.ts";

/**
 * Private navigation state; never embed this account-specific summary in shared public HTML. creditUgx is the account's
 * credit (negative after a reversal of spent credit); renewsFromCredit says auto-renewal is on and the credit covers its plan.
 */
export type SubscriptionSummary = Readonly<{ activeUntil: string | null; paymentPending: boolean; canSubscribe: boolean;
  creditUgx: number; autoRenew: boolean; renewsFromCredit: boolean }>;
export type SubscriptionStatus = Pick<SubscriptionSummary, "activeUntil" | "paymentPending" | "creditUgx" | "autoRenew" | "renewsFromCredit">;
/** An account with no credit or auto-renewal, as older servers and signed-out states report it. */
export const noCredit = Object.freeze({ creditUgx: 0, autoRenew: false, renewsFromCredit: false });
type Period = Pick<SubscriptionPeriod, "startsAt" | "endsAt" | "revokedAt">;

/** Only an active period and its uninterrupted renewals contribute to the current expiry. */
export function activeSubscriptionUntil(periods: readonly Period[], now: Date): string | null {
  const at = now.getTime();
  let until = at;
  for (const period of [...periods].filter(period => !period.revokedAt && period.endsAt.getTime() > at)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (period.startsAt.getTime() > until) break;
    until = Math.max(until, period.endsAt.getTime());
  }
  return until > at ? new Date(until).toISOString() : null;
}
