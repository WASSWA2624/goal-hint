const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hour = 3_600_000, day = 24 * hour;

/** Subscription times use the service's timezone, including the year at renewal boundaries. */
export function formatSubscriptionExpiry(instant: Date): string {
  return `${expiryFormat.format(instant)} EAT`;
}

/** The day and the time apart, for "Expires on 31 Oct 2026 at 15:12 EAT". */
export function subscriptionExpiryParts(instant: Date): Readonly<{ day: string; time: string }> {
  return { day: dayFormat.format(instant), time: `${timeFormat.format(instant)} EAT` };
}

/** Time left, rounded down: whole days, then whole hours on the last day, then "under an hour"; null once it has passed. */
export function subscriptionTimeLeft(instant: Date, now: number): Readonly<{ unit: "day" | "hour"; count: number }> | null {
  const left = instant.getTime() - now;
  if (!(left > 0)) return null;
  return left >= day ? { unit: "day", count: Math.floor(left / day) } : { unit: "hour", count: Math.floor(left / hour) };
}
