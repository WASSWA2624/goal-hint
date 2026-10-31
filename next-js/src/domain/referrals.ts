import { subscriptionDayMs, type SubscriptionPeriod } from "./subscription-period.ts";

export const referralRules = Object.freeze({ attributionMs: 30 * subscriptionDayMs, rewardMs: subscriptionDayMs, historyLimit: 10 });
export const validReferralCode = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{32}$/u.test(value);
export const referralPath = (code: string) => `/r/${code}`;

type EarnedPeriod = Pick<SubscriptionPeriod, "startsAt" | "endsAt" | "revokedAt"> & Readonly<{ source: string }>;
export function remainingRewardMs(periods: readonly EarnedPeriod[], at: Date): number {
  return periods.reduce((total, period) => total + (period.source === "referral" && !period.revokedAt
    ? Math.max(0, +period.endsAt - Math.max(+period.startsAt, +at)) : 0), 0);
}

/** Paid/trial windows finish first. A moved reward retains its exact unused time, including a partially used day. */
export function scheduleRewardPeriods<T extends EarnedPeriod & { id: string }>(periods: readonly T[], at: Date): readonly T[] {
  let cursor = periods.reduce((end, period) => period.source !== "referral" && !period.revokedAt ? Math.max(end, +period.endsAt) : end, +at);
  return periods.filter(period => period.source === "referral" && !period.revokedAt && period.endsAt > at)
    .sort((a, b) => +a.startsAt - +b.startsAt || a.id.localeCompare(b.id)).map(period => {
      const remaining = +period.endsAt - Math.max(+at, +period.startsAt);
      const startsAt = period.startsAt <= at && cursor === +at ? period.startsAt : new Date(cursor);
      const endsAt = new Date(cursor + remaining);
      cursor = +endsAt;
      return { ...period, startsAt, endsAt };
    });
}

export type ReferralSummary = Readonly<{
  code: string; verified: number; earnedDays: number; remainingMs: number;
  history: readonly Readonly<{ id: string; registeredAt: string; rewardedAt: string | null; status: "pending" | "rewarded" | "ineligible" }>[];
}>;
