const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shortDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short" });
const minute = 60_000, hour = 60 * minute, day = 24 * hour;

/** Subscription times use the service's timezone, including the year at renewal boundaries. */
export function formatSubscriptionExpiry(instant: Date): string {
  return `${expiryFormat.format(instant)} EAT`;
}

/** The day and the time apart, for "Expires on 31 Oct 2026 at 15:12 EAT". */
export function subscriptionExpiryParts(instant: Date): Readonly<{ day: string; time: string }> {
  return { day: dayFormat.format(instant), time: `${timeFormat.format(instant)} EAT` };
}

/** The day alone, for dense history rows: "24 Oct". */
export function formatShortDay(instant: Date): string {
  return shortDayFormat.format(instant);
}

/** Whole remaining units, rounded down; null for expired or invalid instants. */
export function subscriptionTimeRemaining(instant: Date, now: number): Readonly<{ days: number; hours: number; minutes: number }> | null {
  const left = instant.getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  return { days: Math.floor(left / day), hours: Math.floor(left % day / hour), minutes: Math.floor(left % hour / minute) };
}

/** Coarse account summary: whole days, then whole hours on the last day. */
export function subscriptionTimeLeft(instant: Date, now: number): Readonly<{ unit: "day" | "hour"; count: number }> | null {
  const remaining = subscriptionTimeRemaining(instant, now);
  return remaining && (remaining.days ? { unit: "day", count: remaining.days } : { unit: "hour", count: remaining.hours });
}
