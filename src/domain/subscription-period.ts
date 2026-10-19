export const subscriptionDayMs = 86_400_000;
export type SubscriptionPeriod = Readonly<{ id: string; startsAt: Date; endsAt: Date; revokedAt: Date | null;
  durationDays: number; extensionDays: number }>;
export type CodeStatus = "revoked" | "queued" | "active" | "expired";

export function codeStatus(code: Pick<SubscriptionPeriod, "startsAt" | "endsAt" | "revokedAt">, now: Date): CodeStatus {
  if (code.revokedAt) return "revoked";
  if (now < code.startsAt) return "queued";
  return now < code.endsAt ? "active" : "expired";
}

/** Revoke/extend keep elapsed history; remaining queued periods follow the active end, or start now. */
export function chainPeriods<T extends SubscriptionPeriod>(codes: readonly T[], now: Date): readonly T[] {
  let cursor = now.getTime();
  return [...codes].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id)).map((code) => {
    if (codeStatus(code, now) === "revoked" || code.endsAt <= now) return { ...code };
    const startsAt = code.startsAt <= now && cursor === now.getTime() ? new Date(code.startsAt) : new Date(cursor);
    const endsAt = new Date(startsAt.getTime() + (code.durationDays + code.extensionDays) * subscriptionDayMs);
    cursor = Math.max(cursor, endsAt.getTime());
    return { ...code, startsAt, endsAt };
  });
}

/** Extending an earlier code shifts every later period by exactly the added time, including an already-started renewal. */
export function extendPeriods<T extends SubscriptionPeriod>(codes: readonly T[], id: string, days: number): readonly T[] {
  const target = codes.find((code) => code.id === id);
  if (!target || target.revokedAt || !Number.isInteger(days) || days < 1 || days > 60) throw new RangeError("An extendable period and 1–60 days are required.");
  const extra = days * subscriptionDayMs;
  return codes.map((code) => code.id === id ? { ...code, endsAt: new Date(+code.endsAt + extra), extensionDays: code.extensionDays + days }
    : !code.revokedAt && code.startsAt >= target.endsAt ? { ...code, startsAt: new Date(+code.startsAt + extra), endsAt: new Date(+code.endsAt + extra) } : { ...code });
}

/** Remaining active time rounds up once; queued codes contribute their full day count. */
export function remainingDays(codes: readonly SubscriptionPeriod[], now: Date): number {
  return codes.reduce((days, code) => days + (codeStatus(code, now) === "active"
    ? Math.ceil((code.endsAt.getTime() - now.getTime()) / subscriptionDayMs)
    : codeStatus(code, now) === "queued" ? Math.ceil((code.endsAt.getTime() - code.startsAt.getTime()) / subscriptionDayMs) : 0), 0);
}

const periodDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function formatPeriodEnd(instant: Date): string {
  const parts = Object.fromEntries(periodDate.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} EAT`;
}
