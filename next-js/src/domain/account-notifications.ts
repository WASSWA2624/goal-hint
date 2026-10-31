import { activeSubscriptionUntil } from "./subscription-summary.ts";
import type { SubscriptionPeriod } from "./subscription-period.ts";
import { walletRules } from "./wallet.ts";
import type { ReferralReviewReason } from "./referral-reviews.ts";

export const accountNotificationKinds = ["payment-approved", "payment-rejected", "access-activated", "access-expiring", "access-expired", "referral-earned",
  "referral-reviewed", "referral-reversed", "referral-restored"] as const;
export type AccountNotificationKind = typeof accountNotificationKinds[number];
export const accountNotificationRules = Object.freeze({ pageSize: 20, retentionMs: 90 * 86_400_000, leadMs: walletRules.renewLeadMs, pollMs: 60_000, sweepMs: walletRules.jobSlotMs });
export type AccountNotification = Readonly<{ id: string; kind: AccountNotificationKind; occurredAt: string; expiresAt: string | null; read: boolean;
  relatedCaseId?: string; reason?: ReferralReviewReason }>;
export type AccountNotificationPage = Readonly<{ items: readonly AccountNotification[]; unread: number; next: string | null }>;
export type NotificationCursor = Readonly<{ at: Date; id: string }>;
export const notificationId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id);
export function notificationCursor(value: unknown): NotificationCursor | null {
  if (typeof value !== "string" || value.length !== 61) return null;
  const stamp = value.slice(0, 24), id = value.slice(25), at = new Date(stamp);
  return value[24] === "_" && notificationId(id) && Number.isFinite(+at) && at.toISOString() === stamp ? { at, id } : null;
}

/** The same uninterrupted schedule used for subscription status; future gaps never extend current access. */
export function subscriptionReminder(periods: readonly Pick<SubscriptionPeriod, "startsAt" | "endsAt" | "revokedAt">[], at: Date) {
  const active = activeSubscriptionUntil(periods, at);
  if (active) {
    const end = new Date(active);
    return +end - +at <= accountNotificationRules.leadMs ? { kind: "access-expiring" as const, end, occurredAt: new Date(+end - accountNotificationRules.leadMs) } : null;
  }
  const ended = periods.filter(row => !row.revokedAt && row.endsAt <= at).reduce<Date | null>((end, row) => !end || row.endsAt > end ? row.endsAt : end, null);
  return ended && +ended >= +at - accountNotificationRules.retentionMs ? { kind: "access-expired" as const, end: ended, occurredAt: ended } : null;
}

export const notificationSection = (kind: AccountNotificationKind) => kind.startsWith("payment-") ? "payments" as const
  : kind.startsWith("referral-") ? "referrals" as const : "subscription" as const;
